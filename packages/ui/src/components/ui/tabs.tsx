/**
 * @module Tabs
 * Styled tab primitives built on Radix UI Tabs.
 * Exports Tabs root, TabsList row, TabsTrigger with an active underline indicator,
 * and TabsContent as a scrollable panel.
 */
'use client';

import * as TabsPrimitive from '@radix-ui/react-tabs';

export const Tabs = TabsPrimitive.Root;

export function TabsList({ children, ...props }: TabsPrimitive.TabsListProps) {
  return (
    <TabsPrimitive.List
      className="flex border-b border-border"
      {...props}
    >
      {children}
    </TabsPrimitive.List>
  );
}

export function TabsTrigger({ children, ...props }: TabsPrimitive.TabsTriggerProps) {
  return (
    <TabsPrimitive.Trigger
      className="px-4 py-2 text-sm text-text-muted transition-colors hover:text-text-primary data-[state=active]:border-b-2 data-[state=active]:border-accent data-[state=active]:text-text-primary"
      {...props}
    >
      {children}
    </TabsPrimitive.Trigger>
  );
}

export function TabsContent({ children, ...props }: TabsPrimitive.TabsContentProps) {
  return (
    <TabsPrimitive.Content className="flex-1 overflow-auto p-4" {...props}>
      {children}
    </TabsPrimitive.Content>
  );
}
