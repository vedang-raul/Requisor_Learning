'use client'

import { lazy } from 'react'
import styles from './components/alma.module.css'
import AlmaNav from './components/AlmaNav.jsx'
import AlmaHero from './components/AlmaHero.jsx'
import AlmaStrip from './components/AlmaStrip.jsx'
import LazySection from './components/LazySection.jsx'
import Footer from './components/Footer.jsx'

const AlmaDoctrine = lazy(() => import('./components/AlmaDoctrine.jsx'))
const AlmaPipeline = lazy(() => import('./components/AlmaPipeline.jsx'))
const AlmaIndustry = lazy(() => import('./components/AlmaIndustry.jsx'))
const AlmaUniversities = lazy(() => import('./components/AlmaUniversity.jsx'))
const Tutors = lazy(() => import('./components/Tutors.jsx'))
const AlmaCredential = lazy(() => import('./components/AlmaCredential.jsx'))
const AlmaFinale = lazy(() => import('./components/AlmaFinale.jsx'))

export default function App() {
  return (
    <div className={`landing-page ${styles.root}`}>
      <AlmaNav />
      <main>
        <AlmaHero />
        <AlmaStrip />
        <LazySection minHeight={420}>
          <AlmaDoctrine />
        </LazySection>
        <LazySection minHeight={520}>
          <AlmaPipeline />
        </LazySection>
        <LazySection minHeight={560}>
          <AlmaIndustry />
        </LazySection>
        <LazySection minHeight={560}>
          <AlmaUniversities />
        </LazySection>
        <LazySection minHeight={420}>
          <Tutors />
        </LazySection>
        <LazySection minHeight={560}>
          <AlmaCredential />
        </LazySection>
        <LazySection minHeight={420}>
          <AlmaFinale />
        </LazySection>
      </main>
      <Footer />
    </div>
  )
}
