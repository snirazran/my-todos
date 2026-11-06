'use client';

import React from 'react';
import { Users } from 'lucide-react';
import {
  AdminCard,
  AdminPage,
  ConfigShell,
  Field,
  FieldGrid,
  NumberInput,
  ResetLink,
  SaveBar,
  ToggleRow,
} from '@/components/admin/kit';
import { GiftPicker } from '@/components/admin/pickers';
import { useEconomy } from '@/components/admin/useEconomy';
import { FLY_ECONOMY_DEFAULTS } from '@/lib/economy/defaults';

export function FriendsPage() {
  const economy = useEconomy();
  const config = economy.config;
  const buddy = config?.buddy;
  const pond = config?.friendsPond;

  const friendsToMax = pond && pond.perFriendDailyCap > 0 ? Math.ceil(pond.dailyCapFree / pond.perFriendDailyCap) : 0;
  const perFriendTask = pond && pond.tasksPerGeneration > 0 ? pond.fliesPerGeneration / pond.tasksPerGeneration : 0;

  return (
    <AdminPage
      title="Friends & buddies"
      subtitle="Flies that come from other players. Each one is capped per pair, per friend and per day, so a second account is never worth making."
      icon={<Users />}
      actions={
        <ResetLink
          onClick={() =>
            economy.set((prev) => ({
              ...prev,
              buddy: { ...FLY_ECONOMY_DEFAULTS.buddy },
              friendsPond: { ...FLY_ECONOMY_DEFAULTS.friendsPond },
            }))
          }
        >
          Load defaults
        </ResetLink>
      }
    >
      <ConfigShell loading={economy.loading} error={economy.error}>
        {config && buddy && pond ? (
          <div className="space-y-5">
            <AdminCard
              title="Friends' pond"
              subtitle="Friends' finished tasks make flies you can collect. They lose nothing, so a busy friend is always good news."
              icon={<span className="text-[20px]">🪷</span>}
            >
              <div className="space-y-5">
                <div className="rounded-2xl bg-primary/10 px-4 py-3 text-[13px] font-bold text-primary">
                  Every {pond.tasksPerGeneration} friend tasks make {pond.fliesPerGeneration} flies (
                  {perFriendTask.toFixed(2)} per task). Opens after {pond.claimGateTasks} of your own tasks.
                  {friendsToMax ? ` It takes ${friendsToMax}+ active friends to fill the day.` : ''}
                </div>
                <FieldGrid cols={4}>
                  <Field label="Every">
                    <NumberInput value={pond.tasksPerGeneration} min={1} max={100} suffix="tasks" onChange={(tasksPerGeneration) => economy.patchGroup('friendsPond', { tasksPerGeneration })} />
                  </Field>
                  <Field label="Makes">
                    <NumberInput value={pond.fliesPerGeneration} max={100} suffix="flies" onChange={(fliesPerGeneration) => economy.patchGroup('friendsPond', { fliesPerGeneration })} />
                  </Field>
                  <Field label="Opens after" hint="0 keeps it always open.">
                    <NumberInput value={pond.claimGateTasks} max={50} suffix="tasks" onChange={(claimGateTasks) => economy.patchGroup('friendsPond', { claimGateTasks })} />
                  </Field>
                  <Field label="Uncollected flies last">
                    <NumberInput value={pond.expiryHours} min={1} max={336} suffix="hours" onChange={(expiryHours) => economy.patchGroup('friendsPond', { expiryHours })} />
                  </Field>
                  <Field label="Daily cap · free">
                    <NumberInput value={pond.dailyCapFree} max={500} suffix="flies" onChange={(dailyCapFree) => economy.patchGroup('friendsPond', { dailyCapFree })} />
                  </Field>
                  <Field label="Daily cap · Plus">
                    <NumberInput value={pond.dailyCapPlus} max={500} suffix="flies" onChange={(dailyCapPlus) => economy.patchGroup('friendsPond', { dailyCapPlus })} />
                  </Field>
                  <Field label="Per friend a day">
                    <NumberInput value={pond.perFriendDailyCap} max={100} suffix="flies" onChange={(perFriendDailyCap) => economy.patchGroup('friendsPond', { perFriendDailyCap })} />
                  </Field>
                </FieldGrid>
              </div>
            </AdminCard>

            <div className="grid gap-5 lg:grid-cols-2">
              <AdminCard
                title="Weekly friends bonus"
                subtitle="A gift for collecting from several friends on several days. 0 days turns it off."
                icon={<span className="text-[20px]">🎉</span>}
                tone="sun"
              >
                <FieldGrid cols={2}>
                  <Field label="Different friends">
                    <NumberInput value={pond.weeklyBonusFriends} max={50} onChange={(weeklyBonusFriends) => economy.patchGroup('friendsPond', { weeklyBonusFriends })} />
                  </Field>
                  <Field label="Different days">
                    <NumberInput value={pond.weeklyBonusDays} max={7} onChange={(weeklyBonusDays) => economy.patchGroup('friendsPond', { weeklyBonusDays })} />
                  </Field>
                  <Field label="The gift" className="sm:col-span-2">
                    <GiftPicker value={pond.weeklyBonusGiftItemId} onChange={(weeklyBonusGiftItemId) => economy.patchGroup('friendsPond', { weeklyBonusGiftItemId })} />
                  </Field>
                </FieldGrid>
              </AdminCard>

              <AdminCard
                title="Cheers"
                subtitle="Cheering a friend pays the one cheering, once per friend each day."
                icon={<span className="text-[20px]">👏</span>}
                tone="berry"
              >
                <FieldGrid cols={2}>
                  <Field label="Flies per cheer">
                    <NumberInput value={pond.cheerFlies} max={50} suffix="flies" onChange={(cheerFlies) => economy.patchGroup('friendsPond', { cheerFlies })} />
                  </Field>
                  <Field label="Paid cheers a day" hint="More still send, they just don't pay.">
                    <NumberInput value={pond.cheerPaidPerDay} max={50} onChange={(cheerPaidPerDay) => economy.patchGroup('friendsPond', { cheerPaidPerDay })} />
                  </Field>
                </FieldGrid>
              </AdminCard>
            </div>

            <AdminCard
              title="Buddy tasks"
              subtitle="Both buddies get the bonus when the second one finishes a shared task. Limits count payouts, not flies."
              icon={<span className="text-[20px]">🤝</span>}
              tone="sky"
            >
              <div className="space-y-5">
                <FieldGrid cols={3}>
                  <Field label="Bonus each" hint={`${buddy.bonusFlies * buddy.dailyPayouts} flies a day at most.`}>
                    <NumberInput value={buddy.bonusFlies} max={100} suffix="flies" onChange={(bonusFlies) => economy.patchGroup('buddy', { bonusFlies })} />
                  </Field>
                  <Field label="Payouts a day">
                    <NumberInput value={buddy.dailyPayouts} max={50} onChange={(dailyPayouts) => economy.patchGroup('buddy', { dailyPayouts })} />
                  </Field>
                  <Field label="Per buddy pair a day" hint="Stops the two-account farm.">
                    <NumberInput value={buddy.perPairDailyPayouts} max={20} onChange={(perPairDailyPayouts) => economy.patchGroup('buddy', { perPairDailyPayouts })} />
                  </Field>
                </FieldGrid>
                <div className="rounded-2xl bg-muted/45 p-4">
                  <p className="mb-3 text-[14px] font-black">Duo Week</p>
                  <FieldGrid cols={3}>
                    <Field label="Shared tasks in a week" hint="With the same buddy.">
                      <NumberInput value={buddy.duoWeekTasks} max={50} onChange={(duoWeekTasks) => economy.patchGroup('buddy', { duoWeekTasks })} />
                    </Field>
                    <Field label="Gifts a week" hint="0 turns Duo Week off.">
                      <NumberInput value={buddy.duoWeekPerWeek} max={10} onChange={(duoWeekPerWeek) => economy.patchGroup('buddy', { duoWeekPerWeek })} />
                    </Field>
                    <Field label="The gift">
                      <GiftPicker value={buddy.duoWeekGiftItemId} onChange={(duoWeekGiftItemId) => economy.patchGroup('buddy', { duoWeekGiftItemId })} />
                    </Field>
                  </FieldGrid>
                </div>
                <ToggleRow
                  title="Count buddy flies in the task budget"
                  description={`On: buddy bonuses share the ${config.taskIncome.dailyCapFree}/day task cap. Off: they sit outside it, held only by the limits above.`}
                  checked={buddy.countsTowardTaskIncome}
                  onChange={(countsTowardTaskIncome) => economy.patchGroup('buddy', { countsTowardTaskIncome })}
                />
              </div>
            </AdminCard>
          </div>
        ) : null}
      </ConfigShell>
      <SaveBar
        dirty={economy.dirty}
        saving={economy.saving}
        onSave={() => void economy.save()}
        onDiscard={economy.discard}
        label="Friend rewards have unsaved changes"
      />
    </AdminPage>
  );
}
