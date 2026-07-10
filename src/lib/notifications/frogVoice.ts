/**
 * The frog's notification voice. Two registers, mixed across variants:
 * caring coach and dry, lightly dark humor. Hard rules for any new copy:
 * the frog speaks as "I"; every number or claim must come from real data
 * (never invent durations or promises); name the actual task when one is
 * relevant; one register per message, never both mushed together.
 */

type Push = { title: string; body: string };

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

export function shortTaskText(
  text: string | null | undefined,
  max = 30,
): string | null {
  const t = text?.trim();
  if (!t) return null;
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

export function morningMessage(opts: {
  count: number;
  frog: string;
  exampleTask?: string | null;
}): Push {
  const { count, frog } = opts;
  const task = shortTaskText(opts.exampleTask);
  if (count === 1) {
    return pick([
      {
        title: 'One task today',
        body: task
          ? `Just "${task}". Do it and the rest of the day is ours.`
          : 'Just one. Do it and the rest of the day is ours.',
      },
      {
        title: `${frog} checked your list`,
        body: task
          ? `One task: "${task}". Practically done already.`
          : 'One task. Practically done already.',
      },
    ]);
  }
  if (!task) {
    return {
      title: `Today: ${count} tasks`,
      body: "Start with the smallest. I'll handle the cheering.",
    };
  }
  return pick([
    {
      title: `Morning — ${count} on the list`,
      body: `Start with "${task}". I'll handle the cheering.`,
    },
    {
      title: `${count} tasks. I counted twice.`,
      body: `"${task}" looks like the easy one. I'd eat that first.`,
    },
    {
      title: 'Your list is up before you',
      body: `${count} waiting. "${task}" is the one staring at us.`,
    },
  ]);
}

export function eveningMessage(opts: {
  count: number;
  frog: string;
  exampleTask?: string | null;
}): Push {
  const { count } = opts;
  const task = shortTaskText(opts.exampleTask);
  if (count === 1) {
    return pick([
      {
        title: 'One task from a clear list',
        body: task
          ? `It's "${task}". Go get it — I'll get the flies ready.`
          : "Go get it — I'll get the flies ready.",
      },
      {
        title: 'One little task left',
        body: task
          ? `"${task}" thinks it survived the day. Surprise it.`
          : 'It thinks it survived the day. Surprise it.',
      },
    ]);
  }
  if (!task) {
    return {
      title: `${count} still open`,
      body: 'One more tonight and we call it a good day.',
    };
  }
  return pick([
    {
      title: `${count} left — still doable`,
      body: `One more tonight and we sleep happy. "${task}" is right there.`,
    },
    {
      title: 'About tonight…',
      body: `${count} tasks are hoping you forgot them. Prove "${task}" wrong.`,
    },
    {
      title: `${count} still open`,
      body: `I'm not judging. I'm just sitting here, watching "${task}" not happen.`,
    },
  ]);
}

export function taskReminderBody(reminder: string): string {
  if (reminder === 'at_time') {
    return pick([
      "Starts now. I'd help, but — no thumbs.",
      "It's time. I believe in you. Mostly.",
      'Now o’clock. Hop to it.',
    ]);
  }
  if (reminder === '1h') {
    return pick([
      'One hour out. Future you already says thanks.',
      "Starts in an hour. Finish what you're doing — then it's us.",
    ]);
  }
  const minutes = parseInt(reminder, 10);
  if (!Number.isFinite(minutes)) return 'Starts soon. Get set.';
  return pick([
    `${minutes} minutes out. Stretch, hydrate, hop.`,
    `Starts in ${minutes} minutes. I'm excited. And slightly judging.`,
  ]);
}

export function buddyBothFinishedMessage(
  partnerName: string,
  taskText?: string | null,
): Push {
  const task = shortTaskText(taskText);
  return {
    title: task ? `You both did "${task}"` : `You and ${partnerName} both finished`,
    body: pick([
      "Bonus flies for both of you. I'll pretend I never doubted.",
      `Double flies. You and ${partnerName} make it look easy.`,
    ]),
  };
}

export function buddyPartnerFinishedMessage(
  partnerName: string,
  taskText?: string | null,
): Push {
  const task = shortTaskText(taskText);
  return {
    title: task
      ? `${partnerName} did "${task}"`
      : `${partnerName} finished your shared task`,
    body: pick([
      "Your half's still open. Your move.",
      `Don't leave ${partnerName} hanging. Your move.`,
    ]),
  };
}

export function hungerMessage(frog: string): Push {
  return {
    title: `${frog} is hungry`,
    body: "One task and dinner's served. Otherwise I'm taking a fly from your jar tonight. Nothing personal.",
  };
}

export function farewellMessage(frog: string): Push {
  return {
    title: `${frog} will stop croaking for now`,
    body: "These nudges aren't landing, so I'll go quiet. Open the app and I'm right back.",
  };
}

export function friendFliesMessage(owed: number): Push {
  return owed === 1
    ? {
        title: 'A friend earned you a fly',
        body: 'It expires at midnight. Claim it before it buzzes off.',
      }
    : {
        title: `Friends earned you ${owed} flies`,
        body: "They're gone at midnight. Claim them before they buzz off.",
      };
}
