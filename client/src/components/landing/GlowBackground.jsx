import React from 'react';
import { motion } from 'framer-motion';
import { THEME_COLORS } from '../../utils/landingTheme';

export default function GlowBackground() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none">
      {/* These blurred circles create the soft olive glow behind the hero. */}
      <motion.div
        animate={{
          y: [0, 30, 0],
        }}
        transition={{
          duration: 8,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className="absolute -top-1/4 -left-1/4 h-96 w-96 rounded-full blur-3xl opacity-20"
        style={{ backgroundColor: THEME_COLORS.olive.secondary }}
      />

      <motion.div
        animate={{
          // Reverse direction adds gentle movement variety.
          y: [0, -30, 0],
        }}
        transition={{
          duration: 10,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className="absolute -top-1/3 -right-1/4 h-80 w-80 rounded-full blur-3xl opacity-18"
        style={{ backgroundColor: THEME_COLORS.olive.light }}
      />

      <motion.div
        animate={{
          // Horizontal drift keeps the background from looking static.
          x: [0, 50, -50, 0],
        }}
        transition={{
          duration: 12,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className="absolute -bottom-1/4 left-1/3 h-96 w-96 rounded-full blur-3xl opacity-12"
        style={{ backgroundColor: THEME_COLORS.olive.soft }}
      />

      <motion.div
        animate={{
          scale: [1, 1.2, 1],
        }}
        transition={{
          duration: 6,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className="absolute top-1/3 right-1/4 h-64 w-64 rounded-full blur-3xl opacity-10"
        style={{ backgroundColor: THEME_COLORS.olive.primary }}
      />
    </div>
  );
}
