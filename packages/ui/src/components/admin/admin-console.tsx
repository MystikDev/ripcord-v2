'use client';

import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { HubOverview } from './hub-overview';
import { MemberList } from './member-list';
import { BanList } from './ban-list';
import { RoleEditor } from './role-editor';
import { AuditLog } from '../hub/audit-log';
import { HubSettingsTab } from './hub-settings-tab';
import { InviteManager } from './invite-manager';

interface AdminConsoleProps {
  hubId: string;
  hubName: string;
  trigger: React.ReactNode;
}

export function AdminConsole({ hubId, hubName, trigger }: AdminConsoleProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-full max-w-4xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl bg-surface-1 shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <Dialog.Title className="text-lg font-semibold text-text-primary">
              {hubName} &mdash; Settings
            </Dialog.Title>
            <Dialog.Close className="rounded-md p-1 text-text-muted hover:bg-surface-2 hover:text-text-primary">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M4 4l8 8M12 4l-8 8"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </Dialog.Close>
          </div>

          <Tabs defaultValue="overview" className="flex flex-1 flex-col overflow-hidden">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="members">Members</TabsTrigger>
              <TabsTrigger value="bans">Bans</TabsTrigger>
              <TabsTrigger value="roles">Roles</TabsTrigger>
              <TabsTrigger value="invites">Invites</TabsTrigger>
              <TabsTrigger value="audit">Audit Log</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>
            <TabsContent value="overview">
              <HubOverview hubId={hubId} />
            </TabsContent>
            <TabsContent value="members">
              <MemberList hubId={hubId} />
            </TabsContent>
            <TabsContent value="bans">
              <BanList hubId={hubId} />
            </TabsContent>
            <TabsContent value="roles">
              <RoleEditor hubId={hubId} />
            </TabsContent>
            <TabsContent value="invites">
              <InviteManager hubId={hubId} />
            </TabsContent>
            <TabsContent value="audit">
              <AuditLog hubId={hubId} />
            </TabsContent>
            <TabsContent value="settings">
              <HubSettingsTab hubId={hubId} hubName={hubName} />
            </TabsContent>
          </Tabs>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
