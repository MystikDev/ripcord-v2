'use client';
import clsx from 'clsx';

interface StepIndicatorProps {
  totalSteps: number;
  currentStep: number; // 1-indexed
  className?: string;
}

export function StepIndicator({ totalSteps, currentStep, className }: StepIndicatorProps) {
  return (
    <div className={clsx('flex items-center gap-3', className)}>
      {Array.from({ length: totalSteps }, (_, i) => {
        const step = i + 1;
        const isActive = step === currentStep;
        const isCompleted = step < currentStep;
        return (
          <div
            key={step}
            className={clsx(
              'flex items-center justify-center rounded-full transition-all duration-300',
              isActive && 'w-7 h-7 bg-accent text-void font-mono text-[10px] font-bold',
              isCompleted && 'w-3 h-3 bg-accent/50',
              !isActive && !isCompleted && 'w-3 h-3 bg-white/10 border border-white/10',
            )}
            style={isActive ? { animation: 'step-dot-glow 2s ease-in-out infinite' } : undefined}
          >
            {isActive && step}
          </div>
        );
      })}
    </div>
  );
}
