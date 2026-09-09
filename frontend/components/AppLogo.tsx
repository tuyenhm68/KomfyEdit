interface AppLogoProps {
  className?: string
  showText?: boolean
}

/** KomfyEdit brand emblem and wordmark. */
export function AppLogo({ className = 'h-7', showText = true }: AppLogoProps) {
  return (
    <div className={`flex items-center gap-2.5 select-none ${className}`}>
      {/* KomfyEdit Brand Icon Emblem (Exact approved brand icon) */}
      <img
        src="/icon.png"
        alt="KomfyEdit Icon"
        className="h-full w-auto aspect-square flex-shrink-0 object-contain rounded-md select-none pointer-events-none"
      />
      {showText && (
        <span className="font-bold tracking-tight text-white flex items-center text-base">
          Komfy<span className="text-cyan-400 font-semibold ml-0.5">Edit</span>
        </span>
      )}
    </div>
  )
}
