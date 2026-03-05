/**
 * @module onboarding-flow
 * Root orchestrator for the Ripcord first-launch onboarding tutorial.
 * Drives a useReducer state machine through welcome → create/join paths
 * → quick tour → complete. Renders as a full-viewport overlay (no Radix
 * Dialog) with an animated starfield background.
 */
'use client';

import { useReducer, useState, useCallback } from 'react';
import { useHubStore } from '../../stores/server-store';
import { useSettingsStore } from '../../stores/settings-store';
import { useToast } from '../ui/toast';
import { apiFetch } from '../../lib/api';
import { acceptInvite } from '../../lib/invite-api';
import { OnboardingStarfield } from './onboarding-starfield';
import { OnboardingWelcome } from './onboarding-welcome';
import { CreateNameStep } from './create-path/create-name-step';
import { CreateOverviewStep } from './create-path/create-overview-step';
import { CreateSuccessStep } from './create-path/create-success-step';
import { JoinCodeStep } from './join-path/join-code-step';
import { JoinLoadingStep } from './join-path/join-loading-step';
import { JoinSuccessStep } from './join-path/join-success-step';
import { QuickTourOverlay } from './quick-tour/quick-tour-overlay';

// ---------------------------------------------------------------------------
// State machine types
// ---------------------------------------------------------------------------

type OnboardingState =
  | { phase: 'welcome' }
  | { phase: 'create'; step: 1 | 2 | 3 }
  | { phase: 'join'; step: 1 | 2 | 3 }
  | { phase: 'tour' }
  | { phase: 'complete' };

type OnboardingAction =
  | { type: 'CHOOSE_CREATE' }
  | { type: 'CHOOSE_JOIN' }
  | { type: 'BACK' }
  | { type: 'NEXT' }
  | { type: 'CREATE_SUCCESS' }
  | { type: 'JOIN_LOADING' }
  | { type: 'JOIN_SUCCESS' }
  | { type: 'TOUR' }
  | { type: 'COMPLETE' };

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

function reducer(state: OnboardingState, action: OnboardingAction): OnboardingState {
  switch (action.type) {
    case 'CHOOSE_CREATE':
      if (state.phase === 'welcome') return { phase: 'create', step: 1 };
      return state;

    case 'CHOOSE_JOIN':
      if (state.phase === 'welcome') return { phase: 'join', step: 1 };
      return state;

    case 'BACK':
      if (state.phase === 'create') {
        if (state.step === 1) return { phase: 'welcome' };
        if (state.step === 2) return { phase: 'create', step: 1 };
      }
      if (state.phase === 'join') {
        if (state.step === 1) return { phase: 'welcome' };
        if (state.step === 2) return { phase: 'join', step: 1 };
      }
      return state;

    case 'NEXT':
      if (state.phase === 'create') {
        if (state.step === 1) return { phase: 'create', step: 2 };
        if (state.step === 2) return { phase: 'create', step: 3 };
      }
      if (state.phase === 'join') {
        if (state.step === 3) return { phase: 'tour' };
      }
      return state;

    case 'CREATE_SUCCESS':
      if (state.phase === 'create' && state.step === 2) return { phase: 'create', step: 3 };
      return state;

    case 'JOIN_LOADING':
      if (state.phase === 'join' && state.step === 1) return { phase: 'join', step: 2 };
      return state;

    case 'JOIN_SUCCESS':
      if (state.phase === 'join' && state.step === 2) return { phase: 'join', step: 3 };
      return state;

    case 'TOUR':
      return { phase: 'tour' };

    case 'COMPLETE':
      return { phase: 'complete' };

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface OnboardingFlowProps {
  open: boolean;
  onComplete: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OnboardingFlow({ open, onComplete }: OnboardingFlowProps) {
  const [state, dispatch] = useReducer(reducer, { phase: 'welcome' });

  const toast = useToast();
  const hubs = useHubStore((s) => s.hubs);
  const setHubs = useHubStore((s) => s.setHubs);
  const setActiveHub = useHubStore((s) => s.setActiveHub);

  // Form state
  const [hubName, setHubName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [createError, setCreateError] = useState('');
  const [joinError, setJoinError] = useState('');
  const [createdHubName, setCreatedHubName] = useState('');
  const [joinedHubName, setJoinedHubName] = useState('');

  // ------------------------------------------------------------------
  // Create path handler
  // Called from CreateOverviewStep (create.2) when the user clicks
  // "Create Solar System". On success, advances to create.3 (success
  // screen). On error, stays on create.2 and shows the error message.
  // ------------------------------------------------------------------
  const handleCreate = useCallback(async () => {
    const trimmed = hubName.trim();
    if (trimmed.length < 2) {
      setCreateError('Name must be at least 2 characters');
      return;
    }
    setCreating(true);
    setCreateError('');
    try {
      const res = await apiFetch<{ ok: boolean; data: { id: string; name: string; ownerUserId: string } }>(
        '/v1/hubs',
        { method: 'POST', body: JSON.stringify({ name: trimmed }) },
      );
      if (!res.ok || !res.data) throw new Error(res.error ?? 'Failed to create solar system');
      const hubData =
        (res.data as unknown as { data?: { id: string; name: string; ownerUserId: string } })?.data ??
        res.data;
      const newHub = {
        id: (hubData as { id: string }).id,
        name: (hubData as { name: string }).name,
        ownerId: (hubData as { ownerUserId: string }).ownerUserId,
      };
      setHubs([...hubs, newHub]);
      setActiveHub(newHub.id);
      setCreatedHubName(newHub.name);
      toast.success(`Solar system "${newHub.name}" created!`);
      dispatch({ type: 'CREATE_SUCCESS' }); // create.2 → create.3
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create solar system');
    } finally {
      setCreating(false);
    }
  }, [hubName, hubs, setHubs, setActiveHub, toast]);

  // ------------------------------------------------------------------
  // Join path handler
  // Called from JoinCodeStep (join.1) when the user clicks
  // "Join Solar System". Immediately moves to the loading screen
  // (join.2), then advances to success (join.3) or backs to join.1 on
  // error.
  // ------------------------------------------------------------------
  const handleJoin = useCallback(async () => {
    const trimmed = inviteCode.trim();
    if (!trimmed) {
      setJoinError('Enter an invite code');
      return;
    }
    const codeMatch = trimmed.match(/\/invite\/([A-Za-z0-9_-]+)/);
    const code = codeMatch ? codeMatch[1]! : trimmed;
    setJoining(true);
    setJoinError('');
    dispatch({ type: 'JOIN_LOADING' }); // join.1 → join.2 (loading screen)
    try {
      const result = await acceptInvite(code);
      const newHub = { id: result.hubId, name: result.hubName, ownerId: '' };
      setHubs([...hubs, newHub]);
      setActiveHub(newHub.id);
      setJoinedHubName(result.hubName);
      toast.success(`Joined "${result.hubName}"!`);
      dispatch({ type: 'JOIN_SUCCESS' }); // join.2 → join.3
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Failed to join solar system');
      dispatch({ type: 'BACK' }); // join.2 → join.1
    } finally {
      setJoining(false);
    }
  }, [inviteCode, hubs, setHubs, setActiveHub, toast]);

  // ------------------------------------------------------------------
  // Tour complete handler
  // ------------------------------------------------------------------
  const handleTourComplete = useCallback(() => {
    useSettingsStore.getState().setTutorialCompleted(true);
    onComplete();
  }, [onComplete]);

  // Nothing to render when closed
  if (!open) return null;

  // ------------------------------------------------------------------
  // Determine content based on state machine phase/step
  // ------------------------------------------------------------------
  let content: React.ReactNode;

  switch (state.phase) {
    case 'welcome':
      content = (
        <OnboardingWelcome
          onChooseCreate={() => dispatch({ type: 'CHOOSE_CREATE' })}
          onChooseJoin={() => dispatch({ type: 'CHOOSE_JOIN' })}
        />
      );
      break;

    case 'create':
      if (state.step === 1) {
        content = (
          <CreateNameStep
            hubName={hubName}
            onNameChange={setHubName}
            onBack={() => dispatch({ type: 'BACK' })}
            onContinue={() => dispatch({ type: 'NEXT' })}
          />
        );
      } else if (state.step === 2) {
        content = (
          <CreateOverviewStep
            hubName={hubName}
            onBack={() => dispatch({ type: 'BACK' })}
            onCreate={handleCreate}
            creating={creating}
            error={createError}
          />
        );
      } else {
        content = (
          <CreateSuccessStep
            hubName={createdHubName}
            onContinue={() => dispatch({ type: 'TOUR' })}
          />
        );
      }
      break;

    case 'join':
      if (state.step === 1) {
        content = (
          <JoinCodeStep
            inviteCode={inviteCode}
            onCodeChange={setInviteCode}
            onBack={() => dispatch({ type: 'BACK' })}
            onJoin={handleJoin}
            joining={joining}
            error={joinError}
          />
        );
      } else if (state.step === 2) {
        content = <JoinLoadingStep hubName={joinedHubName} />;
      } else {
        content = (
          <JoinSuccessStep
            hubName={joinedHubName}
            onContinue={() => dispatch({ type: 'TOUR' })}
          />
        );
      }
      break;

    case 'tour':
    case 'complete':
    default:
      content = null;
      break;
  }

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  return (
    <div className="fixed inset-0 z-[500]">
      {/* Animated starfield background */}
      <OnboardingStarfield />

      {/* Onboarding step content — hidden during tour and after complete */}
      {state.phase !== 'tour' && state.phase !== 'complete' && (
        <div className="relative z-10 flex items-center justify-center h-full">
          {content}
        </div>
      )}

      {/* Quick tour overlay — rendered on top of (and replacing) the step content */}
      {state.phase === 'tour' && (
        <QuickTourOverlay onComplete={handleTourComplete} />
      )}
    </div>
  );
}
