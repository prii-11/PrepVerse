import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ROUTES } from '../../utils/constants';

export default function Navbar() {
  // Entry animation: the navbar slides down and fades in on first paint.
  const navbarVariants = {
    hidden: { y: -100, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: {
        duration: 0.8,
        ease: 'easeOut',
      },
    },
  };

  const buttonHover = {
    y: -1,
    scale: 1.01,
  };

  return (
    <motion.nav
      variants={navbarVariants}
      initial="hidden"
      animate="visible"
      className="sticky top-4 z-50 px-4 pt-4 sm:px-6 lg:px-8"
    >
      <div className="relative mx-auto max-w-7xl overflow-hidden rounded-full border border-[#A3B18A]/35 bg-white/80 px-4 py-3 shadow-[0_16px_45px_rgba(85,107,47,0.08)] backdrop-blur-xl sm:px-6">
        {/* Flexbox keeps the brand, spacer, and actions aligned in one row. */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-shrink-0 items-center gap-3">
            <div className="h-3 w-3 rounded-full bg-[#556B2F] shadow-[0_0_0_6px_rgba(163,177,138,0.18)]" />
            <h1 className="text-xl font-semibold tracking-tight text-[#556B2F] sm:text-2xl">PrepVerse</h1>
          </div>

          <div className="hidden flex-1 lg:block" />

          <div className="flex items-center gap-3">
            {/* Secondary button: outlined style keeps hierarchy below Sign Up. */}
            <motion.div whileHover={buttonHover} whileTap={{ scale: 0.98 }} transition={{ duration: 0.2 }}>
              <Link
                to={ROUTES.login}
                className="inline-flex items-center justify-center rounded-full border border-[#A3B18A] bg-white px-4 py-2 text-sm font-semibold text-[#556B2F] transition-all duration-300 hover:bg-[#F8F9F5] sm:px-5"
              >
                Login
              </Link>
            </motion.div>

            {/* Primary CTA: filled olive button to attract the main click. */}
            <motion.div whileHover={buttonHover} whileTap={{ scale: 0.98 }} transition={{ duration: 0.2 }}>
              <Link
                to={ROUTES.signup}
                className="inline-flex items-center justify-center rounded-full bg-[#556B2F] px-4 py-2 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(85,107,47,0.18)] transition-all duration-300 hover:bg-[#4B5D2A] sm:px-5"
              >
                Sign Up
              </Link>
            </motion.div>
          </div>
        </div>
      </div>
    </motion.nav>
  );
}
