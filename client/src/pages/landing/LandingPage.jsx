import React from 'react';
import Navbar from '../../components/landing/Navbar';
import HeroSection from '../../components/landing/HeroSection';
import GlowBackground from '../../components/landing/GlowBackground';

export default function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-white text-[#1F2937]">
      {/* Background elements sit behind the content and never block clicks. */}
      <GlowBackground />

      {/* Sticky top navigation for brand and auth actions. */}
      <Navbar />

      {/* Main hero area with heading, rotating text, and dashboard preview. */}
      <main>
        <HeroSection />
      </main>
    </div>
  );
}
