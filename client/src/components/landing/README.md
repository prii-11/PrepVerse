# PrepVerse Landing Page Documentation

## Overview

A premium AI SaaS landing page built with React, Tailwind CSS, and Framer Motion. Features a Black × Purple fusion theme with glassmorphism effects and smooth animations.

## 📁 File Structure

```
src/
├── pages/landing/
│   └── LandingPage.jsx          # Main landing page container
├── components/landing/
│   ├── Navbar.jsx               # Floating glassmorphic navbar
│   ├── HeroSection.jsx           # Hero section with heading & animated text
│   ├── AnimatedText.jsx          # Animated text that cycles through words
│   ├── DashboardCard.jsx         # Floating dashboard mockup with analytics
│   └── GlowBackground.jsx        # Animated background glow elements
├── utils/
│   └── landingTheme.js           # Centralized theme configuration
└── routes/
    └── AppRoutes.jsx              # Updated with landing page route
```

## 🎨 Color Palette

All colors are defined in `utils/landingTheme.js`:

| Element | Color | Hex |
|---------|-------|-----|
| Primary Purple | — | #7C3AED |
| Secondary Purple | — | #A855F7 |
| Accent Glow | — | #C084FC |
| Indigo | — | #6366F1 |
| Background | — | #0F0F12 |
| Card Background | — | #18181B |
| Primary Text | — | #FFFFFF |
| Secondary Text | — | #B3B3B3 |
| Border | — | rgba(255,255,255,0.08) |

## 🧩 Components

### 1. **LandingPage.jsx**
Main container that orchestrates the entire landing page layout.

**Props:** None  
**Features:**
- Dark gradient background
- Renders Navbar, HeroSection, and GlowBackground
- Responsive container

### 2. **Navbar.jsx**
Floating glassmorphic navigation bar with brand and action buttons.

**Props:** None  
**Features:**
- Slides down on page load (Framer Motion)
- Sticky positioning
- Purple gradient brand text with glow
- Login button with purple border & glow effect
- Sign Up button with purple gradient & scale animation
- Responsive design for mobile/tablet/desktop

**Customization:**
```jsx
// Change brand name
<h1>YourBrandName</h1>

// Modify button text
<button>Your Button Text</button>

// Adjust glow effect
style={{
  boxShadow: isHovered
    ? '0 0 20px rgba(124, 58, 237, 0.6)'
    : '0 0 10px rgba(124, 58, 237, 0.2)',
}}
```

### 3. **HeroSection.jsx**
Main hero content with heading, animated text, subtitle, and dashboard card.

**Props:** None  
**Features:**
- Fading heading animation
- Integrates AnimatedText component
- "Practice. Track. Improve." subtitle
- DashboardCard with floating animation
- Bottom gradient fade effect

**Customization:**
```jsx
// Change main heading
<h1>Your Heading Text</h1>

// Change subtitle
<p>Your Subtitle</p>
```

### 4. **AnimatedText.jsx**
Cycles through a list of words with smooth fade in/out animations.

**Props:** None  
**Features:**
- Configurable word list (ANIMATED_WORDS array)
- 3-second cycle with smooth fade transitions
- Purple gradient text with glow effect
- Infinite loop

**Customization:**
```jsx
const ANIMATED_WORDS = [
  'Your Word 1',
  'Your Word 2',
  'Your Word 3',
  'Your Word 4',
];

// Change cycle duration (currently 3000ms)
}, 3000); // Adjust this value
```

### 5. **DashboardCard.jsx**
Floating glassmorphic card with analytics mockup.

**Props:** None  
**Features:**
- Circular progress charts (customizable percentages)
- Performance trend graph
- Weak areas section
- AI Question card
- AI Feedback card
- Smooth animations on load
- Floating animation

**Customization:**
```jsx
// Change score percentages
<CircularProgress percentage={85} label="Resume Score" color="#7C3AED" />

// Modify weak areas
{['Eye Contact', 'Pacing', 'Clarity'].map((area, idx) => (
  // ...
))}

// Update feedback text
<p className="text-xs text-[#B3B3B3]">
  Your feedback text here
</p>
```

### 6. **GlowBackground.jsx**
Animated background with blurred glowing circles.

**Props:** None  
**Features:**
- 4 animated glow elements
- Smooth floating/scaling animations
- Low opacity for subtle effect
- Different colors (Purple, Violet, Indigo)

**Customization:**
```jsx
// Change animation duration
duration: 8, // Current is 8 seconds

// Modify glow size
className="w-96 h-96" // Change width/height

// Adjust opacity
opacity-10 // Change opacity level

// Change colors
bg-[#7C3AED] // Use different hex colors
```

## 🎬 Framer Motion Animations

All animations use Framer Motion for smooth, premium feel:

| Component | Animation | Duration |
|-----------|-----------|----------|
| Navbar | Slides down on load | 0.8s |
| Hero Heading | Fades in | 0.8s |
| Animated Text | Fade in/out cycle | 0.6s per transition |
| Dashboard Card | Fades in + floats | 0.8s + infinite |
| Glow Elements | Various movements | 6-12s |
| Buttons | Scale on hover | 0.3s |

## 📱 Responsive Design

The landing page is fully responsive:

- **Mobile (<640px):** Adjusted font sizes, stacked layouts, optimized spacing
- **Tablet (640px-1024px):** Medium font sizes, grid layouts
- **Desktop (>1024px):** Large hero with full dashboard card

Tailwind classes automatically handle breakpoints:
```jsx
className="text-2xl md:text-3xl lg:text-4xl"
//         mobile    tablet       desktop
```

## 🔧 Installation & Setup

1. **Landing page already integrated** into your React app
2. **Framer Motion already installed** (check package.json)
3. **Tailwind CSS configured** (no additional setup needed)

## 🚀 Usage

### Add to your app:
The landing page is already added to your routes at `/`:

```jsx
// routes/AppRoutes.jsx
<Route path="/" element={<LandingPage />} />
```

### Navigate to landing:
```jsx
<Link to="/">Visit Landing Page</Link>
```

## 🎨 Customization Guide

### Change Colors Globally
Edit `utils/landingTheme.js`:
```js
export const THEME_COLORS = {
  purple: {
    primary: '#YOUR_COLOR',
    secondary: '#YOUR_COLOR',
    accent: '#YOUR_COLOR',
  },
  // ...
};
```

### Modify Animation Speeds
Update animation configurations in each component:
```jsx
transition={{
  duration: 0.8, // Change this value
  ease: 'easeOut',
}}
```

### Add Navigation Links (if needed)
Modify `Navbar.jsx` center section:
```jsx
{/* Center: Navigation Links */}
<nav className="hidden md:flex gap-8">
  <a href="#features">Features</a>
  <a href="#pricing">Pricing</a>
  {/* ... */}
</nav>
```

### Update Dashboard Card Content
Edit the scores and content in `DashboardCard.jsx`:
```jsx
<CircularProgress 
  percentage={YOUR_PERCENT} 
  label="Your Label" 
  color="#YOUR_COLOR" 
/>
```

## 📦 Dependencies

- **React** (^19.1.0)
- **Framer Motion** (^12.40.0) - For animations
- **Tailwind CSS** (^4.1.11) - For styling
- **Tailwind Merge** (^3.6.0) - For class merging
- **React Router DOM** (^7.7.1) - For routing

## 🌟 Performance Tips

1. **Optimize Images:** Replace placeholder content with optimized images
2. **Lazy Load:** Use React.lazy() for components below the fold
3. **Animation Performance:** Monitor for smooth 60fps animations
4. **Bundle Size:** Tree-shake unused Tailwind classes

## 🐛 Troubleshooting

### Animations not working?
- Ensure Framer Motion is installed: `npm install framer-motion`
- Check that components are properly imported

### Styling issues?
- Clear Tailwind cache: Delete `.next` folder
- Ensure Tailwind CSS is properly configured in your project

### Navbar not sticky?
- Check z-index conflicts in other components
- Ensure `fixed` positioning is applied

## 📝 Notes

- All components use Tailwind CSS utility classes
- Animations are optimized for 60fps performance
- Design is production-ready and scalable
- Easy to customize colors, text, and animations
- Responsive by default with mobile-first approach

---

**Made with ❤️ for PrepVerse**
