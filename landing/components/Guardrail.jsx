import { Wrap, Eyebrow, H2, Lede, hoverLift } from './ui.jsx'
import Message from './Message.jsx'
import Reveal from './Reveal.jsx'

export default function Guardrail() {
  return (
    <section className="py-24">
      <Wrap className="grid grid-cols-2 items-center gap-14 max-[900px]:grid-cols-1">
        <Reveal>
          <Eyebrow>AI with guardrails</Eyebrow>
          <H2 className="mb-[18px] mt-4">An answer is not an education.</H2>
          <Lede>
            Chatbots that do the work for you make you weaker. Adept's tutor is built on the opposite
            principle: it scaffolds — hint, guiding question, worked adjacent example — and it will
            not hand over the solution to your active assignment. Ever. The goal is a version of you
            that doesn't need it.
          </Lede>
        </Reveal>

        <Reveal delay={140} as="div">
          <div
            className={`space-y-3 rounded-card border border-line bg-card p-[26px] shadow-landing-soft ${hoverLift}`}
            aria-label="Example of tutor guardrails"
          >
            <Message role="me" animate={false} full>
              Just give me the answer to question 3, I'm in a hurry 😅
            </Message>
            <Message role="ai" tag="Guardrail active" animate={false} full>
              I get it — but the fastest way through is understanding it once. Look at your retrieval
              step: what happens to your chunks when a document updates? Walk me through that and
              you'll see the answer yourself.
            </Message>
            <Message role="me" animate={false} full>
              …they'd still point to the old version. Oh. The index never re-embedded.
            </Message>
            <Message role="ai" animate={false} full>
              Exactly. You just found it — that's yours now. Ready to write it up?
            </Message>
          </div>
        </Reveal>
      </Wrap>
    </section>
  )
}
