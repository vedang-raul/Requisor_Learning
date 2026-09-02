'use client'

import { lazy } from 'react'
import Nav from './components/Nav.jsx'
import Hero from './components/Hero.jsx'
import Strip from './components/Strip.jsx'
import LazySection from './components/LazySection.jsx'
import Footer from './components/Footer.jsx'

const Problem = lazy(() => import('./components/Problem.jsx'))
const Tailored = lazy(() => import('./components/Tailored.jsx'))
const HowItWorks = lazy(() => import('./components/HowItWorks.jsx'))
const Guardrail = lazy(() => import('./components/Guardrail.jsx'))
const Partners = lazy(() => import('./components/Partners.jsx'))
const Tutors = lazy(() => import('./components/Tutors.jsx'))
const Credentials = lazy(() => import('./components/Credentials.jsx'))
const FinalCta = lazy(() => import('./components/FinalCta.jsx'))

export default function App() {
  return (
    <div className="landing-page">
      <Nav />
      <Hero />
      <Strip />
      <LazySection minHeight={640}>
        <Problem />
      </LazySection>
      <LazySection minHeight={680}>
        <Tailored />
      </LazySection>
      <LazySection minHeight={420}>
        <HowItWorks />
      </LazySection>
      <LazySection minHeight={480}>
        <Guardrail />
      </LazySection>
      <LazySection minHeight={460}>
        <Partners />
      </LazySection>
      <LazySection minHeight={420}>
        <Tutors />
      </LazySection>
      <LazySection minHeight={560}>
        <Credentials />
      </LazySection>
      <LazySection minHeight={420}>
        <FinalCta />
      </LazySection>
      <Footer />
    </div>
  )
}
