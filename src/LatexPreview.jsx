import { useCallback, useEffect, useRef, useState } from 'react'
import { MathJax, MathJaxContext } from 'better-react-mathjax'
import texSource from '../Q34_Version3.tex?raw'

const mathJaxConfig = {
  loader: { load: ['input/tex', 'output/chtml', '[tex]/color', '[tex]/html'] },
  tex: {
    inlineMath: [['$', '$'], ['\\(', '\\)']],
    displayMath: [['\\[', '\\]']],
    processEscapes: true,
    packages: { '[+]': ['ams', 'color', 'html'] },
  },
}

function stripComments(source) {
  return source
    .split('\n')
    .map((line) => {
      let output = ''

      for (let index = 0; index < line.length; index += 1) {
        if (line[index] === '%' && line[index - 1] !== '\\') {
          break
        }

        output += line[index]
      }

      return output
    })
    .join('\n')
}

function readBraceGroup(source, openBraceIndex) {
  if (openBraceIndex < 0 || source[openBraceIndex] !== '{') {
    return null
  }

  let depth = 0

  for (let index = openBraceIndex; index < source.length; index += 1) {
    const char = source[index]
    const prevChar = source[index - 1]

    if (char === '{' && prevChar !== '\\') {
      depth += 1
    } else if (char === '}' && prevChar !== '\\') {
      depth -= 1

      if (depth === 0) {
        return {
          value: source.slice(openBraceIndex + 1, index),
          end: index + 1,
        }
      }
    }
  }

  return null
}

function skipWhitespace(source, index) {
  let cursor = index

  while (cursor < source.length && /\s/.test(source[cursor])) {
    cursor += 1
  }

  return cursor
}

function readCommandArgs(source, startIndex, command, argCount) {
  const marker = `\\${command}`

  if (!source.startsWith(marker, startIndex)) {
    return null
  }

  let cursor = startIndex + marker.length
  const args = []

  for (let index = 0; index < argCount; index += 1) {
    cursor = skipWhitespace(source, cursor)
    const group = readBraceGroup(source, cursor)

    if (!group) {
      return null
    }

    args.push(group.value)
    cursor = group.end
  }

  return { args, end: cursor }
}

function extractCommandValue(source, command) {
  const marker = `\\${command}`
  const commandIndex = source.indexOf(marker)

  if (commandIndex === -1) {
    return ''
  }

  const group = readBraceGroup(source, source.indexOf('{', commandIndex + marker.length))
  return group?.value ?? ''
}

function extractEnvironment(source, name, fromIndex = 0) {
  const beginToken = `\\begin{${name}}`
  const endToken = `\\end{${name}}`
  const start = source.indexOf(beginToken, fromIndex)

  if (start === -1) {
    return null
  }

  let contentStart = start + beginToken.length

  if (source[contentStart] === '[') {
    let depth = 0

    for (let index = contentStart; index < source.length; index += 1) {
      if (source[index] === '[') {
        depth += 1
      } else if (source[index] === ']') {
        depth -= 1
        if (depth === 0) {
          contentStart = index + 1
          break
        }
      }
    }
  }

  let depth = 1
  let cursor = contentStart

  while (cursor < source.length) {
    const nextBegin = source.indexOf(beginToken, cursor)
    const nextEnd = source.indexOf(endToken, cursor)

    if (nextEnd === -1) {
      return null
    }

    if (nextBegin !== -1 && nextBegin < nextEnd) {
      depth += 1
      cursor = nextBegin + beginToken.length
      continue
    }

    depth -= 1

    if (depth === 0) {
      return {
        start,
        end: nextEnd + endToken.length,
        content: source.slice(contentStart, nextEnd),
      }
    }

    cursor = nextEnd + endToken.length
  }

  return null
}

function unwrapCommands(source, commandNames) {
  let output = source

  for (const command of commandNames) {
    let cursor = 0
    let next = ''

    while (cursor < output.length) {
      const marker = `\\${command}`
      const index = output.indexOf(marker, cursor)

      if (index === -1) {
        next += output.slice(cursor)
        break
      }

      next += output.slice(cursor, index)
      const parsed = readCommandArgs(output, index, command, 1)

      if (!parsed) {
        next += marker
        cursor = index + marker.length
        continue
      }

      next += parsed.args[0]
      cursor = parsed.end
    }

    output = next
  }

  return output
}

function replaceTwoArgCommandsWithLabel(source, commandNames) {
  let output = source

  for (const command of commandNames) {
    let cursor = 0
    let next = ''

    while (cursor < output.length) {
      const marker = `\\${command}`
      const index = output.indexOf(marker, cursor)

      if (index === -1) {
        next += output.slice(cursor)
        break
      }

      next += output.slice(cursor, index)
      const parsed = readCommandArgs(output, index, command, 2)

      if (!parsed) {
        next += marker
        cursor = index + marker.length
        continue
      }

      next += parsed.args[1]
      cursor = parsed.end
    }

    output = next
  }

  return output
}

function sanitizeLatex(source) {
  let output = source

  output = replaceTwoArgCommandsWithLabel(output, ['qdeflink', 'deflink', 'backtoterm'])
  output = replaceTwoArgCommandsWithLabel(output, ['textcolor', 'colorbox'])
  output = unwrapCommands(output, ['textbf', 'textit', 'emph', 'underline', 'small'])
  output = replaceTwoArgCommandsWithLabel(output, ['hyperref', 'hyperlink'])

  output = output
    .replace(/\\questionanchor\{[^}]*\}/g, '')
    .replace(/\\defanchor\{[^}]*\}/g, '')
    .replace(/\\label\{[^}]*\}/g, '')
    .replace(/\\refstepcounter\{[^}]*\}/g, '')
    .replace(/\\setcounter\{[^}]*\}\{[^}]*\}/g, '')
    .replace(/\\tikz\[[^\]]*\]\s*\\node(?:\[[^\]]*\])?\([^)]+\)\{([\s\S]*?)\};/g, '$1')
    .replace(/\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\}/g, '')
    .replace(/\\begin\{center\}/g, '')
    .replace(/\\end\{center\}/g, '')
    .replace(/\\hspace\*?\{[^}]*\}/g, ' ')
    .replace(/\\reversemarginpar/g, '')
    .replace(/\\maketitle/g, '')
    .replace(/\\,/g, ' ')
    .replace(/\\!/g, '')

  return output
}

function findVisibleTarget(wrapper, id) {
  const candidates = wrapper.querySelectorAll(`[id="${id}"]`)

  return Array.from(candidates).find((element) => {
    const rect = element.getBoundingClientRect()
    const style = window.getComputedStyle(element)
    const isAssistiveMath = element.closest('.MJX_Assistive_MathML')

    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      !isAssistiveMath
    )
  })
}

function stripMathDelimiters(source) {
  return source.replace(/\$/g, '').replace(/\\\(|\\\)/g, '')
}

function stripHyperrefCommands(source) {
  let output = source

  output = output.replace(/\\hyperref\[[^\]]*\]\{([^}]*)\}/g, '$1')
  output = output.replace(/\\hyperlink\{[^}]*\}\{([^}]*)\}/g, '$1')

  for (const command of ['hyperref', 'hyperlink']) {
    let cursor = 0
    let next = ''

    while (cursor < output.length) {
      const marker = `\\${command}`
      const index = output.indexOf(marker, cursor)

      if (index === -1) {
        next += output.slice(cursor)
        break
      }

      next += output.slice(cursor, index)
      let localCursor = index + marker.length

      while (/\s/.test(output[localCursor] ?? '')) {
        localCursor += 1
      }

      if (output[localCursor] === '[') {
        let depth = 0

        for (; localCursor < output.length; localCursor += 1) {
          if (output[localCursor] === '[') {
            depth += 1
          } else if (output[localCursor] === ']') {
            depth -= 1
            if (depth === 0) {
              localCursor += 1
              break
            }
          }
        }
      }

      while (/\s/.test(output[localCursor] ?? '')) {
        localCursor += 1
      }

      const labelGroup = readBraceGroup(output, localCursor)

      if (!labelGroup) {
        cursor = index + marker.length
        continue
      }

      next += labelGroup.value
      cursor = labelGroup.end
    }

    output = next
  }

  return output
}

function normalizeText(source) {
  return source.replace(/\s+/g, ' ').trim()
}

function looksMathLike(source) {
  return /\\(sqrt|frac|sin|cos|tan|cdot|left|right|theta|pi|int|displaystyle|begin|end)|[_^=]/.test(
    source,
  )
}

function normalizeMathTextCommands(source) {
  let output = source
  let cursor = 0
  let next = ''

  while (cursor < output.length) {
    const index = output.indexOf('\\text', cursor)

    if (index === -1) {
      next += output.slice(cursor)
      break
    }

    next += output.slice(cursor, index)
    const parsed = readCommandArgs(output, index, 'text', 1)

    if (!parsed) {
      next += '\\text'
      cursor = index + 5
      continue
    }

    const inner = stripHyperrefCommands(stripMathDelimiters(parsed.args[0].trim()))

    if (looksMathLike(inner)) {
      next += inner
    } else {
      next += `\\text{${inner}}`
    }

    cursor = parsed.end
  }

  return next
}

function sanitizeMathSource(source) {
  let output = source

  output = replaceTwoArgCommandsWithLabel(output, ['qdeflink', 'deflink', 'backtoterm'])
  output = replaceTwoArgCommandsWithLabel(output, ['textcolor', 'colorbox'])
  output = stripHyperrefCommands(output)
  output = stripMathDelimiters(output)
  output = output
    .replace(/\\questionanchor\{[^}]*\}/g, '')
    .replace(/\\defanchor\{[^}]*\}/g, '')
    .replace(/\\label\{[^}]*\}/g, '')
    .replace(/\\hspace\*?\{[^}]*\}/g, ' ')
    .replace(/\\qquad/g, ' ')
    .replace(/\\quad/g, ' ')
    .replace(/\\,/g, ' ')
    .replace(/\\!/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  return normalizeMathTextCommands(output)
}

function transformTikzAnchors(mathSource) {
  const anchors = []
  const transformedMath = mathSource.replace(
    /\\tikz\[[^\]]*\]\s*\\node(?:\[[^\]]*\])?\(([^)]+)\)\{([\s\S]*?)\};/g,
    (_, anchorId, rawContent) => {
      const content = sanitizeMathSource(rawContent)
      anchors.push(anchorId)
      return `\\class{arrow-anchor}{\\cssId{${anchorId}}{${content}}}`
    },
  )

  return { anchors, math: transformedMath }
}

function parseTikzArrows(source) {
  const arrows = []
  const drawPattern =
    /\\draw\[[^\]]*?(?:bend left=([0-9.]+))?[^\]]*?\]\s*\(\[yshift=([0-9.\-]+)pt\]([^.]+)\.[^)]+\)\s*to\s*\(\[yshift=([0-9.\-]+)pt\]([^.]+)\.[^)]+\)/g

  for (const match of source.matchAll(drawPattern)) {
    arrows.push({
      fromId: match[3].trim(),
      toId: match[5].trim(),
      bend: Number(match[1] ?? 14),
      fromShiftPt: Number(match[2] ?? 0),
      toShiftPt: Number(match[4] ?? 0),
    })
  }

  return arrows
}

function tokenizeInline(source) {
  const tokens = []
  let cursor = 0

  while (cursor < source.length) {
    const char = source[cursor]

    if (char === '$') {
      let end = cursor + 1

      while (end < source.length && source[end] !== '$') {
        end += 1
      }

      if (end < source.length) {
        const value = source.slice(cursor + 1, end).trim()
        if (value) {
          tokens.push({ type: 'math', value: sanitizeMathSource(value) })
        }
        cursor = end + 1
        continue
      }
    }

    let end = cursor

    while (end < source.length && source[end] !== '$') {
      end += 1
    }

    const text = normalizeText(
      source
        .slice(cursor, end)
        .replace(/\\item\b/g, '')
        .replace(/\\[a-zA-Z]+\*?(?:\[[^\]]*\])?/g, ' ')
        .replace(/[{}]/g, ''),
    )

    if (text) {
      tokens.push({ type: 'text', value: text })
    }

    cursor = end
  }

  return tokens
}

function parseContentBlocks(source) {
  const blocks = []
  const pattern = /\\\[((?:[\s\S]*?))\\\]/g
  let cursor = 0

  for (const match of source.matchAll(pattern)) {
    const index = match.index ?? 0
    const before = normalizeText(sanitizeLatex(source.slice(cursor, index)))

    if (before) {
      blocks.push({ type: 'paragraph', tokens: tokenizeInline(before) })
    }

    const math = match[1].trim()
    const anchorData = transformTikzAnchors(math)
    const remainder = source.slice(index + match[0].length)
    const tikzMatch = remainder.match(/^\s*\\begin\{tikzpicture\}([\s\S]*?)\\end\{tikzpicture\}/)
    const arrows = tikzMatch ? parseTikzArrows(tikzMatch[1]) : []

    if (math) {
      blocks.push({
        type: 'displayMath',
        value: sanitizeMathSource(anchorData.math),
        arrows,
        anchors: anchorData.anchors,
      })
    }

    cursor = index + match[0].length

    if (tikzMatch) {
      cursor += tikzMatch[0].length
    }
  }

  const trailing = normalizeText(sanitizeLatex(source.slice(cursor)))
  if (trailing) {
    blocks.push({ type: 'paragraph', tokens: tokenizeInline(trailing) })
  }

  return blocks
}

function parseEnumerate(source) {
  const items = []
  const cleaned = sanitizeLatex(source)
  const lines = cleaned.split('\n')
  let current = ''

  for (const rawLine of lines) {
    const line = rawLine.trim()

    if (!line || line.startsWith('\\begin{enumerate}') || line.startsWith('\\end{enumerate}')) {
      continue
    }

    if (line.startsWith('\\item')) {
      if (current) {
        items.push(current.trim())
      }
      current = line.replace(/^\\item\s*/, '')
      continue
    }

    current = `${current} ${line}`.trim()
  }

  if (current) {
    items.push(current.trim())
  }

  return items.map((item) => tokenizeInline(item))
}

function parseSteps(source) {
  const steps = []
  let cursor = 0
  let summaryEnd = source.length

  while (cursor < source.length) {
    const mainIndex = source.indexOf('\\mainStep', cursor)

    if (mainIndex === -1) {
      break
    }

    if (steps.length === 0) {
      summaryEnd = mainIndex
    }

    const mainStep = readCommandArgs(source, mainIndex, 'mainStep', 2)
    if (!mainStep) {
      cursor = mainIndex + 9
      continue
    }

    const step = {
      number: steps.length + 1,
      title: normalizeText(sanitizeLatex(mainStep.args[1])),
      subSteps: [],
    }

    cursor = mainStep.end
    const nextMainIndex = source.indexOf('\\mainStep', cursor)
    const stepChunk = source.slice(cursor, nextMainIndex === -1 ? source.length : nextMainIndex)

    let subCursor = 0
    while (subCursor < stepChunk.length) {
      const subIndex = stepChunk.indexOf('\\solutionStep', subCursor)

      if (subIndex === -1) {
        break
      }

      const subStep = readCommandArgs(stepChunk, subIndex, 'solutionStep', 3)
      if (!subStep) {
        subCursor = subIndex + 13
        continue
      }

      step.subSteps.push({
        number: `${step.number}.${step.subSteps.length + 1}`,
        title: normalizeText(sanitizeLatex(subStep.args[1])),
        blocks: parseContentBlocks(subStep.args[2]),
      })

      subCursor = subStep.end
    }

    steps.push(step)
  }

  return {
    summary: parseContentBlocks(source.slice(0, summaryEnd)),
    steps,
  }
}

function parseDocument(source) {
  const withoutComments = stripComments(source)
  const title = normalizeText(sanitizeLatex(extractCommandValue(withoutComments, 'title')))
  const author = normalizeText(sanitizeLatex(extractCommandValue(withoutComments, 'author')))
  const date = normalizeText(sanitizeLatex(extractCommandValue(withoutComments, 'date')))
  const documentEnv = extractEnvironment(withoutComments, 'document')
  const body = documentEnv?.content ?? ''

  const sectionMatch = body.match(/\\section\*\{([\s\S]*?)\}/)
  const sectionTitle = normalizeText(sanitizeLatex(sectionMatch?.[1] ?? ''))
  const afterSection = sectionMatch ? body.slice((sectionMatch.index ?? 0) + sectionMatch[0].length) : body

  const enumerateEnv = extractEnvironment(afterSection, 'enumerate')
  const questionSource = enumerateEnv ? afterSection.slice(0, enumerateEnv.start) : afterSection
  const solutionEnv = extractEnvironment(afterSection, 'tcolorbox')
  const questionIntro = parseContentBlocks(
    enumerateEnv ? afterSection.slice(0, enumerateEnv.start) : questionSource,
  )
  const choices = enumerateEnv ? parseEnumerate(enumerateEnv.content) : []

  const tcolorboxOpen = afterSection.match(/\\begin\{tcolorbox\}\[([\s\S]*?)\]/)
  const titleMatch = tcolorboxOpen?.[1]?.match(/title=([\s\S]*)/)
  const solutionTitle = normalizeText(sanitizeLatex(titleMatch?.[1] ?? 'Solution'))

  const parsedSteps = parseSteps(solutionEnv?.content ?? '')

  return {
    title,
    author,
    date,
    sectionTitle,
    questionIntro,
    choices,
    solutionTitle,
    solutionSummary: parsedSteps.summary,
    steps: parsedSteps.steps,
  }
}

const documentData = parseDocument(texSource)

function DisplayMathBlock({ value, arrows }) {
  const wrapperRef = useRef(null)
  const [paths, setPaths] = useState([])

  const updateArrows = useCallback(() => {
    const wrapper = wrapperRef.current

    if (!wrapper || arrows.length === 0) {
      setPaths([])
      return
    }

    const wrapperRect = wrapper.getBoundingClientRect()
    const nextPaths = arrows
      .map((arrow) => {
        const from = findVisibleTarget(wrapper, arrow.fromId)
        const to = findVisibleTarget(wrapper, arrow.toId)

        if (!from || !to) {
          return null
        }

        const fromRect = from.getBoundingClientRect()
        const toRect = to.getBoundingClientRect()
        const baseGap = 4
        const fromShift = arrow.fromShiftPt * 1.33 + baseGap
        const toShift = arrow.toShiftPt * 1.33 + baseGap
        const startX = fromRect.left + fromRect.width / 2 - wrapperRect.left
        const endX = toRect.left + toRect.width / 2 - wrapperRect.left
        const startY = fromRect.top - wrapperRect.top - fromShift
        const endY = toRect.top - wrapperRect.top - toShift
        const controlX = (startX + endX) / 2
        const controlY = Math.min(startY, endY) - 14 - arrow.bend * 1.4

        return `M ${startX} ${startY} Q ${controlX} ${controlY} ${endX} ${endY}`
      })
      .filter(Boolean)

    setPaths(nextPaths)
  }, [arrows])

  useEffect(() => {
    const wrapper = wrapperRef.current

    if (!wrapper) {
      return undefined
    }

    const observer = new MutationObserver(() => {
      window.requestAnimationFrame(updateArrows)
    })

    observer.observe(wrapper, {
      childList: true,
      subtree: true,
      attributes: true,
    })

    const timer = window.setTimeout(updateArrows, 250)
    window.addEventListener('resize', updateArrows)

    return () => {
      observer.disconnect()
      window.clearTimeout(timer)
      window.removeEventListener('resize', updateArrows)
    }
  }, [updateArrows, value])

  return (
    <div className="math-block math-with-arrows" ref={wrapperRef}>
      <MathJax dynamic>{`\\[${value}\\]`}</MathJax>

      {paths.length > 0 && (
        <svg className="equation-arrow-layer" aria-hidden="true">
          <defs>
            <marker
              id="equation-arrowhead"
              markerWidth="6.5"
              markerHeight="6.5"
              refX="6"
              refY="3.25"
              orient="auto"
            >
              <path d="M 0 0 L 6.5 3.25 L 0 6.5 z" />
            </marker>
          </defs>

          {paths.map((path, index) => (
            <path
              className="equation-arrow"
              d={path}
              key={`arrow-${index}`}
              markerEnd="url(#equation-arrowhead)"
            />
          ))}
        </svg>
      )}
    </div>
  )
}

function InlineTokens({ tokens }) {
  return (
    <>
      {tokens.map((token, index) =>
        token.type === 'math' ? (
          <MathJax inline dynamic key={`math-${index}`}>{`\\(${token.value}\\)`}</MathJax>
        ) : (
          <span key={`text-${index}`}>
            {token.value}
            {index < tokens.length - 1 ? ' ' : ''}
          </span>
        ),
      )}
    </>
  )
}

function ContentBlocks({ blocks }) {
  return blocks.map((block, index) =>
    block.type === 'displayMath' ? (
      <DisplayMathBlock key={`block-${index}`} value={block.value} arrows={block.arrows ?? []} />
    ) : (
      <p key={`block-${index}`}>
        <InlineTokens tokens={block.tokens} />
      </p>
    ),
  )
}

function StepCard({ step }) {
  return (
    <section className="step-group">
      <div className="step-bubble">
        <span className="step-pill">Step {step.number}</span>
        <strong>{step.title}</strong>
      </div>

      <div className="substep-list">
        {step.subSteps.map((subStep) => (
          <article className="substep-card" key={subStep.number}>
            <div className="substep-heading">
              <span className="substep-number">Step {subStep.number}</span>
              <h4>{subStep.title}</h4>
            </div>
            <div className="substep-content">
              <ContentBlocks blocks={subStep.blocks} />
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

export default function LatexPreview() {
  return (
    <MathJaxContext version={3} config={mathJaxConfig}>
      <main className="latex-page">
        <section className="question-card framed-card">
          <h2>{documentData.sectionTitle}</h2>
          <div className="question-body">
            <ContentBlocks blocks={documentData.questionIntro} />
          </div>
          <ol className="choice-list">
            {documentData.choices.map((choice, index) => (
              <li key={`choice-${index}`}>
                <InlineTokens tokens={choice} />
              </li>
            ))}
          </ol>
        </section>

        <section className="solution-card">
          <div className="solution-banner">{documentData.solutionTitle}</div>
          <div className="solution-summary">
            <ContentBlocks blocks={documentData.solutionSummary} />
          </div>
          {documentData.steps.map((step) => (
            <StepCard key={step.number} step={step} />
          ))}
        </section>
      </main>
    </MathJaxContext>
  )
}
