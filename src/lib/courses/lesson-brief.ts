/**
 * A rough brief for the lesson wizard's AI note, drafted from step 1:
 * "Title (Section): description", within the note's 600 characters. A title
 * repeated inside the description (as in Curriculum Blueprint lessons) is said once.
 */
export function lessonBrief(title: string, section: string, description: string): string {
  const clean = (value: string) => value.replace(/\s+/g, " ").trim();
  const name = clean(title);
  let about = clean(description);
  if (name && about !== name) about = clean(about.split(name).join(" ")).replace(/^[\s:;,.—-]+|[\s:;,—-]+$/g, "");
  if (about === name) about = "";
  const head = [name, clean(section) && `(${clean(section)})`].filter(Boolean).join(" ");
  return [head, about].filter(Boolean).join(": ").slice(0, 600);
}
