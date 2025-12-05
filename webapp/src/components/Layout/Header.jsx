import { motion } from 'framer-motion';


export default function Header({ title }) {
  return (
    <header
      className="fixed top-0 left-0 right-0 z-40"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="flex items-center justify-between px-4" style={{ height: '56px' }}>


        {/* Title */}
        <h1 className="flex-1 text-xl font-bold text-white text-center">{title}</h1>

        {/* Spacer for symmetry */}
        <div style={{ width: '40px', height: '40px' }} />
      </div>
    </header>
  );
}
