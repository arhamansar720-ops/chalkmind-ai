/**
 * Custom instructions: what the student tells the tutor about themselves and
 * how they want it to talk to them — like ChatGPT's custom instructions. They
 * can also bring over what ChatGPT (or another assistant) already knows about
 * them: copy IMPORT_PROMPT into that assistant, paste its answer back, and
 * splitImportedProfile() sorts it into the two fields.
 */

export const MAX_INSTRUCTION_CHARS = 1500;

export const IMPORT_PROMPT = `I'm setting up an AI tutor app and want it to know me the way you do. Based on everything you know about me from our conversations and your memory, write a short profile with exactly two sections:

About me:
- who I am as a learner: age or grade, what I'm studying, my goals, subjects I find easy or hard, interests, and anything else that helps a tutor (no private details like addresses or passwords)

How to talk to me:
- how I like explanations and replies: tone, length, level of detail, use of examples, humor, language, and anything I've asked you to do or not do

Keep it under 200 words, plain text, written in the first person ("I...").`;

const ABOUT_HEADING = /^\s*(?:#+\s*|\*\*)?\s*(?:about me|who i am|about)\s*(?:\*\*)?\s*:?\s*(?:\*\*)?\s*$/i;
const STYLE_HEADING = /^\s*(?:#+\s*|\*\*)?\s*(?:how to (?:talk|respond|speak|reply) to me|how i like (?:you to (?:talk|respond)|replies|explanations)|response style|how to respond)\s*(?:\*\*)?\s*:?\s*(?:\*\*)?\s*$/i;
const INLINE = /^\s*(?:\*\*)?\s*(about me|how to (?:talk|respond|speak|reply) to me)\s*(?:\*\*)?\s*:\s*(?:\*\*)?\s*(.+)$/i;

/** Split an assistant's answer to IMPORT_PROMPT into "about me" and "how to talk to me". */
export function splitImportedProfile(text: string): { about: string; style: string } {
  const about: string[] = [];
  const style: string[] = [];
  let section: string[] | null = null;
  let sawHeading = false;
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    if (ABOUT_HEADING.test(line)) {
      section = about;
      sawHeading = true;
      continue;
    }
    if (STYLE_HEADING.test(line)) {
      section = style;
      sawHeading = true;
      continue;
    }
    const inline = INLINE.exec(line);
    if (inline) {
      section = /about/i.test(inline[1]) ? about : style;
      sawHeading = true;
      section.push(inline[2]);
      continue;
    }
    (section ?? about).push(line);
  }
  const clean = (lines: string[]) => clip(lines.join("\n").replace(/\n{3,}/g, "\n\n").trim());
  if (!sawHeading) return { about: clip(text.trim()), style: "" };
  return { about: clean(about), style: clean(style) };
}

export function clip(text: string, max = MAX_INSTRUCTION_CHARS): string {
  return text.length > max ? text.slice(0, max).trimEnd() : text;
}
