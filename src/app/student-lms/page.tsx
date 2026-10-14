import Link from "next/link";
import { headers } from "next/headers";
import {
  STUDENT_LMS_FAQS,
  STUDENT_LMS_METADATA,
  STUDENT_LMS_STRUCTURED_DATA,
  serializeStructuredData,
} from "@/lib/courses/seo";
import styles from "./student-lms.module.css";

export const metadata = STUDENT_LMS_METADATA;

export default async function StudentLmsPage() {
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <>
      <script
        type="application/ld+json"
        nonce={nonce}
        dangerouslySetInnerHTML={{
          __html: serializeStructuredData(STUDENT_LMS_STRUCTURED_DATA),
        }}
      />
      <div className={styles.page}>
        <header className={styles.header}>
          <nav className={styles.nav} aria-label="Main navigation">
            <Link className={styles.wordmark} href="/" aria-label="Alma 41 home">
              <span>alma 41</span>
              <i aria-hidden="true" />
            </Link>
            <span className={styles.navLabel}>A guide for learners</span>
            <Link className={styles.loginLink} href="/login/learners-login/">
              Learner login <span aria-hidden="true">↗</span>
            </Link>
          </nav>
        </header>

        <main>
          <section className={styles.hero} aria-labelledby="page-title">
            <div className={styles.heroInner}>
              <p className={styles.eyebrow}>
                <span aria-hidden="true" /> LEARNING, WITH ROOM TO THINK
              </p>
              <h1 id="page-title">A student LMS should make learning easier to follow.</h1>
              <p className={styles.heroLead}>
                Alma 41 brings course lessons, helpful study tools and your
                progress into one learner space—so you can spend less time
                finding your place and more time understanding the material.
              </p>
              <div className={styles.heroActions}>
                <Link className={styles.primaryButton} href="/login/learners-login/">
                  Go to learner login <span aria-hidden="true">→</span>
                </Link>
                <Link className={styles.textButton} href="#how-it-works">
                  Explore the guide <span aria-hidden="true">↓</span>
                </Link>
              </div>
              <p className={styles.heroNote}>
                Courses are written by tutors and made available to students
                through learner login.
              </p>
            </div>
            <aside className={styles.heroAside} aria-label="A learner's course view">
              <div className={styles.asideTop}>
                <span className={styles.asideMark} aria-hidden="true">a.</span>
                <span>YOUR COURSE, IN ORDER</span>
              </div>
              <div className={styles.courseName}>Foundations of clear thinking</div>
              <div className={styles.courseMeta}>A sample lesson sequence</div>
              <ol className={styles.lessonList}>
                <li><span className={styles.lessonDone} aria-hidden="true">✓</span><span>Start with the question</span><small>Lesson 01</small></li>
                <li className={styles.lessonCurrent}><span className={styles.lessonNumber}>02</span><span>Look for the evidence</span><small>In progress</small></li>
                <li><span className={styles.lessonNumber}>03</span><span>Build a useful explanation</span><small>Lesson 03</small></li>
              </ol>
              <div className={styles.progressLabel}><span>Course progress</span><span>2 of 6 lessons</span></div>
              <div className={styles.progressTrack} role="img" aria-label="Illustrative course progress: two of six lessons">
                <span />
              </div>
              <p className={styles.sampleCaption}>Illustrative course view</p>
            </aside>
          </section>

          <section className={styles.intro} id="how-it-works" aria-labelledby="intro-title">
            <div className={styles.sectionIndex}>01 <span>THE BASICS</span></div>
            <div className={styles.introCopy}>
              <h2 id="intro-title">What is a student learning management system?</h2>
              <p>
                A student learning management system (LMS) is a digital place
                where learners access course materials, follow lessons and keep
                track of their work. Instead of scattering resources across
                messages and documents, an LMS gives a course a clear structure:
                what to study, where to continue and how learning activities fit
                together.
              </p>
              <p>
                Alma 41 is a learning platform for tutor-authored courses.
                Tutors can use AI-assisted drafts as part of preparing course
                content, then author and organize the learning experience.
                Students use learner login to access the courses made available
                to them. The platform supports teaching; it does not replace a
                teacher’s judgment, conversation or care.
              </p>
            </div>
          </section>

          <section className={styles.features} aria-labelledby="features-title">
            <div className={styles.featuresHeading}>
              <div className={styles.sectionIndex}>02 <span>INSIDE ALMA 41</span></div>
              <h2 id="features-title">A steadier way to move through a course.</h2>
              <p>Study tools sit alongside the lesson—not in the way of it.</p>
            </div>
            <div className={styles.featureGrid}>
              <article className={styles.feature}>
                <span className={styles.featureNo}>A / 01</span>
                <h3>Lessons with a sequence</h3>
                <p>Courses are arranged into structured lessons, so you can see what belongs together and return to the next step when you are ready.</p>
              </article>
              <article className={styles.feature}>
                <span className={styles.featureNo}>A / 02</span>
                <h3>Video, plus the words</h3>
                <p>Lessons may include video. Where a transcript is provided, you can use the written version to revisit an explanation, follow along or study at your own pace.</p>
              </article>
              <article className={styles.feature}>
                <span className={styles.featureNo}>A / 03</span>
                <h3>Progress you can return to</h3>
                <p>Progress tracking helps you keep your place in a course. Notes and bookmarks give you a way to save a thought or mark a passage for another look.</p>
              </article>
              <article className={styles.feature}>
                <span className={styles.featureNo}>A / 04</span>
                <h3>Questions in context</h3>
                <p>Course question AI support can help explain material and respond to questions about your learning. Treat it as study support, and use your tutor for guidance that needs a teacher’s judgment.</p>
              </article>
              <article className={styles.feature}>
                <span className={styles.featureNo}>A / 05</span>
                <h3>Practice when a course provides it</h3>
                <p>Some courses include quizzes or assignments. These activities offer a way to check understanding or apply an idea; their availability depends on the course.</p>
              </article>
              <article className={styles.feature}>
                <span className={styles.featureNo}>A / 06</span>
                <h3>Listen in a familiar language</h3>
                <p>ElevenLabs narration can read AI replies aloud using available voices. English, Marathi and Hindi are among the available languages; voice and language options can vary.</p>
              </article>
            </div>
          </section>

          <section className={styles.support} aria-labelledby="support-title">
            <div className={styles.supportArt} aria-hidden="true">
              <div className={`${styles.orbit} ${styles.orbitOne}`} />
              <div className={`${styles.orbit} ${styles.orbitTwo}`} />
              <div className={styles.orbitCore}>41</div>
              <span className={styles.orbitDot} />
            </div>
            <div className={styles.supportCopy}>
              <div className={styles.sectionIndex}>03 <span>THE HUMAN PART</span></div>
              <h2 id="support-title">Organized learning. Still taught by people.</h2>
              <p>
                An LMS can bring materials and study activity into one place,
                but it cannot promise a particular result. Learning depends on
                the course, your circumstances and the work you put in. Alma 41
                is designed to support the teaching tutors provide and give
                students useful ways to engage with that teaching.
              </p>
              <Link className={styles.supportLink} href="/login/learners-login/">
                Continue to learner login <span aria-hidden="true">→</span>
              </Link>
            </div>
          </section>

          <section className={styles.faqSection} aria-labelledby="faq-title">
            <div className={styles.faqIntro}>
              <div className={styles.sectionIndex}>04 <span>QUICK ANSWERS</span></div>
              <h2 id="faq-title">Student LMS questions</h2>
              <p>A few useful details before you sign in.</p>
            </div>
            <div className={styles.faqList}>
              {STUDENT_LMS_FAQS.map((faq) => (
                <details className={styles.faqItem} key={faq.question}>
                  <summary>{faq.question}<span aria-hidden="true" /></summary>
                  <p>{faq.answer}</p>
                </details>
              ))}
            </div>
          </section>

          <section className={styles.closing} aria-labelledby="closing-title">
            <p className={styles.eyebrow}>A GOOD PLACE TO PICK UP</p>
            <h2 id="closing-title">Your course is waiting where you left it.</h2>
            <Link className={styles.primaryButton} href="/login/learners-login/">
              Open learner login <span aria-hidden="true">→</span>
            </Link>
          </section>
        </main>

        <footer className={styles.footer}>
          <Link className={styles.footerBrand} href="/">alma 41<span aria-hidden="true">.</span></Link>
          <p>Learning tools for courses taught by people.</p>
          <Link href="/login/learners-login/">Learner login</Link>
        </footer>
      </div>
    </>
  );
}
