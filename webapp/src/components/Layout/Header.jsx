export default function Header({ title }) {
  return (
    <header className="fixed top-0 left-0 right-0 z-40 pt-safe">
      <div className="glass-elevated border-b border-white/10">
        <div className="flex items-center justify-between px-4 py-4">
          <h1 className="text-2xl font-bold text-white">{title}</h1>
        </div>
      </div>
    </header>
  );
}
