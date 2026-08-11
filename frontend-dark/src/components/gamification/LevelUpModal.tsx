import { motion, AnimatePresence } from 'framer-motion'
import { Zap, Star } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useGamificationStore } from '../../store/gamification'

const levelTitles: Record<number, string> = {
  1: 'Novice',
  2: 'Analyst',
  3: 'Associate',
  4: 'Consultant',
  5: 'Senior Consultant',
  6: 'Manager',
  7: 'Senior Manager',
  8: 'Director',
  9: 'VP',
  10: 'Partner',
}

function Particle({ index }: { index: number }) {
  const x = (Math.random() - 0.5) * 400
  const y = -(Math.random() * 300 + 100)
  const rotate = Math.random() * 720 - 360

  return (
    <motion.div
      className="absolute top-1/2 left-1/2 w-2 h-2 rounded-full"
      style={{
        backgroundColor: index % 2 === 0 ? '#fff' : '#a3a3a3',
        opacity: 0.8,
      }}
      initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
      animate={{ x, y, opacity: 0, scale: 0, rotate }}
      transition={{ duration: 1.5, delay: index * 0.03, ease: 'easeOut' }}
    />
  )
}

export function LevelUpModal() {
  const { pendingLevelUp, level, dismissLevelUp } = useGamificationStore()
  const [showParticles, setShowParticles] = useState(false)

  useEffect(() => {
    if (pendingLevelUp) {
      setShowParticles(true)
      const timer = setTimeout(() => {
        dismissLevelUp()
      }, 3500)
      return () => clearTimeout(timer)
    }
  }, [pendingLevelUp, dismissLevelUp])

  const title = levelTitles[level] || `Level ${level}`

  return (
    <AnimatePresence>
      {pendingLevelUp && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black"
          onClick={dismissLevelUp}
        >
          <div className="relative flex flex-col items-center text-center px-8">
            {/* Particles */}
            {showParticles && (
              <div className="absolute inset-0 pointer-events-none">
                {Array.from({ length: 40 }).map((_, i) => (
                  <Particle key={i} index={i} />
                ))}
              </div>
            )}

            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', damping: 12, stiffness: 150, delay: 0.2 }}
              className="w-24 h-24 rounded-full bg-[#1B2431] flex items-center justify-center mb-6"
            >
              <span className="text-4xl font-bold text-black">{level}</span>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
            >
              <p className="text-white/60 text-sm font-medium tracking-widest uppercase mb-2">
                Level Up!
              </p>
              <h1 className="text-4xl font-bold text-white mb-2">{title}</h1>
              <div className="flex items-center justify-center gap-2 text-white/60">
                <Zap className="w-4 h-4" />
                <span className="text-sm">You reached Level {level}</span>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1 }}
              className="flex items-center gap-1 mt-8"
            >
              {[...Array(3)].map((_, i) => (
                <Star key={i} className="w-5 h-5 text-white/40" fill="currentColor" />
              ))}
            </motion.div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.5 }}
              className="text-white/40 text-xs mt-4"
            >
              Click anywhere to continue
            </motion.p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
