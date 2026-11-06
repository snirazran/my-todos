const SOURCE_LABELS: Record<string, string> = {
  task: 'Tasks',
  task_streak: 'Task streaks',
  task_streak_milestone: 'Streak milestones',
  leap: 'Leap',
  quest: 'Quests',
  quest_objective: 'Quests',
  spend: 'Spending',
  quest_sweep_roll: 'Clean Sweep',
  season: 'Season pass',
  login_streak: 'Daily streak',
  shop_gift: 'Shop gift',
  rewarded_ad: 'Ads',
  rewarded_ad_double: 'Ad doubles',
  friend_pond: "Friends' pond",
  friend_pond_double: "Friends' pond doubles",
  friend_cheer: 'Cheers',
  friend_activity: 'Friend activity',
  friend_reward_double: 'Friend doubles',
  friends_room: 'Friends room',
  buddy: 'Buddy tasks',
  invite: 'Invites',
  referral: 'Referrals',
  focus: 'Focus timer',
  deep_focus: 'Deep focus',
  fly_game: 'Fly Snack',
  daily_reward: 'Daily reward',
  admin: 'Admin grants',
  campaign: 'Offers',
  move_to_web: 'Move to web',
  real_money_pack: 'Fly packs',
  subscription: 'Plus',
  frog_hunger_refund: 'Hunger refund',
  cross_platform_gift: 'Cross-platform gift',
  skin_shop: 'Shop purchases',
  background_shop: 'Background purchases',
  shield: 'Lily Pads',
};

export function sourceLabel(source: string) {
  if (SOURCE_LABELS[source]) return SOURCE_LABELS[source];
  const words = source.replace(/[_-]+/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : source;
}
