'use client';
import { SolarSystemSVG } from './illustrations/solar-system-svg';
import { LinkChainSVG } from './illustrations/link-chain-svg';

interface WelcomeProps {
  onChooseCreate: () => void;
  onChooseJoin: () => void;
}

export function OnboardingWelcome({ onChooseCreate, onChooseJoin }: WelcomeProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-full px-8 py-12">
      {/* Title */}
      <h1
        className="font-display font-light tracking-[0.2em] uppercase text-center select-none mb-2"
        style={{
          fontSize: '28px',
          animation: 'onboard-title-reveal 0.6s cubic-bezier(0.16, 1, 0.3, 1) both',
          background: 'linear-gradient(135deg, #00e5ff 0%, #8338ec 50%, #ff006e 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}
      >
        Welcome to Ripcord
      </h1>
      <p
        className="font-mono text-[12px] tracking-[0.15em] uppercase text-white/30 mb-12 select-none"
        style={{ animation: 'onboard-title-reveal 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.15s both' }}
      >
        Your solar system awaits
      </p>

      {/* Path cards */}
      <div
        className="flex gap-6 max-w-[700px] w-full"
        style={{ animation: 'onboard-title-reveal 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.3s both' }}
      >
        {/* Create Card */}
        <button
          type="button"
          onClick={onChooseCreate}
          className="flex-1 flex flex-col items-center gap-5 p-8 rounded-2xl cursor-pointer transition-all duration-300 group"
          style={{
            background: 'rgba(7, 9, 13, 0.85)',
            border: '1px solid rgba(0, 229, 255, 0.15)',
            backdropFilter: 'blur(12px)',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = 'rgba(0, 229, 255, 0.4)';
            (e.currentTarget as HTMLElement).style.boxShadow = '0 20px 40px -15px rgba(0, 229, 255, 0.15)';
            (e.currentTarget as HTMLElement).style.transform = 'translateY(-4px)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = 'rgba(0, 229, 255, 0.15)';
            (e.currentTarget as HTMLElement).style.boxShadow = 'none';
            (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
          }}
        >
          <SolarSystemSVG className="w-[140px] h-[140px]" />
          <div className="text-center">
            <h3 className="font-mono text-[12px] tracking-[0.1em] uppercase text-[#00e5ff] mb-1.5">
              Create Your Solar System
            </h3>
            <p className="font-mono text-[10px] text-white/40">
              Start a new community from scratch
            </p>
          </div>
        </button>

        {/* Join Card */}
        <button
          type="button"
          onClick={onChooseJoin}
          className="flex-1 flex flex-col items-center gap-5 p-8 rounded-2xl cursor-pointer transition-all duration-300 group"
          style={{
            background: 'rgba(7, 9, 13, 0.85)',
            border: '1px solid rgba(131, 56, 236, 0.15)',
            backdropFilter: 'blur(12px)',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = 'rgba(131, 56, 236, 0.4)';
            (e.currentTarget as HTMLElement).style.boxShadow = '0 20px 40px -15px rgba(131, 56, 236, 0.15)';
            (e.currentTarget as HTMLElement).style.transform = 'translateY(-4px)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = 'rgba(131, 56, 236, 0.15)';
            (e.currentTarget as HTMLElement).style.boxShadow = 'none';
            (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
          }}
        >
          <LinkChainSVG className="w-[140px] h-[140px]" />
          <div className="text-center">
            <h3 className="font-mono text-[12px] tracking-[0.1em] uppercase text-[#b060ff] mb-1.5">
              Join a Friend's Solar System
            </h3>
            <p className="font-mono text-[10px] text-white/40">
              Enter an invite code to join
            </p>
          </div>
        </button>
      </div>
    </div>
  );
}
