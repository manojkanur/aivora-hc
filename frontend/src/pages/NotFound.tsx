import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { fadeUp, scaleIn } from '../lib/animations'

const backgroundShapes = [
  { size: 320, x: '-10%', y: '5%', delay: 0 },
  { size: 200, x: '75%', y: '10%', delay: 0.15 },
  { size: 160, x: '60%', y: '65%', delay: 0.3 },
  { size: 260, x: '5%', y: '60%', delay: 0.1 },
  { size: 120, x: '40%', y: '80%', delay: 0.2 },
]

export default function NotFound() {
  const navigate = useNavigate()

  return (
    <div
      style={{ backgroundColor: '#fafafa', color: '#0a0a0a' }}
      className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden"
    >
      {/* Animated background shapes */}
      {backgroundShapes.map((shape, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{
            duration: 1.2,
            delay: shape.delay,
            ease: [0.25, 0.46, 0.45, 0.94],
          }}
          style={{
            position: 'absolute',
            width: shape.size,
            height: shape.size,
            left: shape.x,
            top: shape.y,
            borderRadius: '50%',
            backgroundColor: '#e5e5e5',
            opacity: 0.45,
            pointerEvents: 'none',
          }}
        />
      ))}

      {/* Content */}
      <div className="relative z-10 text-center max-w-lg mx-auto">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={scaleIn}
        >
          <h1
            className="font-black leading-none tracking-tighter select-none"
            style={{ fontSize: '9rem', color: '#0a0a0a' }}
          >
            404
          </h1>
        </motion.div>

        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          custom={1}
          className="space-y-3"
        >
          <h2
            className="text-2xl font-bold"
            style={{ color: '#0a0a0a' }}
          >
            Page not found
          </h2>
          <p
            className="text-base leading-relaxed"
            style={{ color: '#525252' }}
          >
            The page you&apos;re looking for doesn&apos;t exist or has been moved.
          </p>
        </motion.div>

        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          custom={2}
          className="flex items-center justify-center gap-3 mt-10 flex-wrap"
        >
          {/* Go to Dashboard — black button */}
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate('/dashboard')}
            className="inline-flex items-center justify-center font-medium rounded-lg px-6 py-3 text-base transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            style={{
              backgroundColor: '#18181b',
              color: '#ffffff',
              border: '1px solid #18181b',
            }}
            onMouseEnter={e => {
              ;(e.currentTarget as HTMLButtonElement).style.backgroundColor = '#27272a'
            }}
            onMouseLeave={e => {
              ;(e.currentTarget as HTMLButtonElement).style.backgroundColor = '#18181b'
            }}
          >
            Go to Dashboard
          </motion.button>

          {/* Go Home — ghost button */}
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate('/')}
            className="inline-flex items-center justify-center font-medium rounded-lg px-6 py-3 text-base transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            style={{
              backgroundColor: 'transparent',
              color: '#0a0a0a',
              border: '1px solid #e5e5e5',
            }}
            onMouseEnter={e => {
              ;(e.currentTarget as HTMLButtonElement).style.backgroundColor = '#f4f4f5'
            }}
            onMouseLeave={e => {
              ;(e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'
            }}
          >
            Go Home
          </motion.button>
        </motion.div>
      </div>
    </div>
  )
}
