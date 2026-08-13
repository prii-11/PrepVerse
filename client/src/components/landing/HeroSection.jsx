import React from 'react';
import { motion } from 'framer-motion';
import AnimatedText from './AnimatedText';
import DashboardCard from './DashboardCard';

export default function HeroSection() {
  // Heading appears first so users can read context before the animated words.
  const headingVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.8,
        ease: 'easeOut',
      },
    },
  };

  const subtitleVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.8,
        ease: 'easeOut',
        delay: 0.3,
      },
    },
  };

  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center px-4 pt-32 pb-20 md:pt-40 md:pb-32">
      {/* Main Content */}
      <div className="max-w-4xl mx-auto text-center">
        {/* Main Heading */}
        <motion.h1
          variants={headingVariants}
          initial="hidden"
          animate="visible"
          className="mb-4 text-3xl font-semibold leading-tight text-[#1F2937] md:text-5xl lg:text-6xl"
        >
          AI Practice Studio For
        </motion.h1>

        {/* Animated Text */}
        <AnimatedText />

        {/* Subtitle appears slightly later to create a visual reading flow. */}
        <motion.p
          variants={subtitleVariants}
          initial="hidden"
          animate="visible"
          className="text-lg md:text-2xl text-[#B3B3B3] mt-8 md:mt-10 font-medium"
        >
          Practice. Track. Improve.
        </motion.p>
      </div>

      {/* Dashboard Card */}
      <div className="w-full max-w-6xl mx-auto mt-12">
        <DashboardCard />
      </div>

      {/* Bottom Gradient Fade */}
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-white to-transparent" />
    </section>
  );
}
