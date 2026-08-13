import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { THEME_COLORS } from '../../utils/landingTheme';

const ANIMATED_WORDS = [
  'Job Interview',
  'Communication Improvement',
  'Resume Building',
  'Instant Feedback',
];

export default function AnimatedText() {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    // The text rotates slowly so the hero feels alive without distracting from the message.
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % ANIMATED_WORDS.length);
    }, 2500);

    return () => clearInterval(interval);
  }, []);

  const textVariants = {
    // Enter from below, settle in center, then exit upward for a smooth loop.
    enter: {
      opacity: 0,
      y: 10,
    },
    center: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.6,
        ease: 'easeInOut',
      },
    },
    exit: {
      opacity: 0,
      y: -10,
      transition: {
        duration: 0.6,
        ease: 'easeInOut',
      },
    },
  };

  return (
    <div className="relative flex h-24 items-center justify-center md:h-20">
      {/* AnimatePresence swaps one word at a time and waits for exit before enter. */}
      <AnimatePresence mode="wait">
        <motion.h2
          key={ANIMATED_WORDS[currentIndex]}
          variants={textVariants}
          initial="enter"
          animate="center"
          exit="exit"
          className="absolute text-center text-4xl font-semibold tracking-tight text-[#556B2F] md:text-6xl lg:text-7xl"
          style={{
            textShadow: `0 12px 40px ${THEME_COLORS.olive.secondary}22`,
          }}
        >
          {ANIMATED_WORDS[currentIndex]}
        </motion.h2>
      </AnimatePresence>
    </div>
  );
}
