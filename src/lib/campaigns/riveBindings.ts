import type { Rive, ViewModelInstance } from '@rive-app/react-canvas-lite';
import type {
  RiveArtboardInfo,
  RiveInputInfo,
  RiveInputTarget,
  RiveInputType,
  RiveInputValue,
} from './types';

/**
 * Everything that talks to a loaded .riv imperatively.
 *
 * It lives outside the component because a campaign's animation values are
 * data an admin typed, not props known at build time: a hook per property
 * would change the hook count every time someone added a row, which React
 * forbids. Reading and writing through the runtime's own accessors keeps the
 * number of names an admin can invent unbounded.
 */

const SM_INPUT_TYPES: Record<number, RiveInputType> = {
  56: 'number',
  58: 'trigger',
  59: 'boolean',
};

const DATA_TYPE_TO_INPUT: Record<string, RiveInputType | undefined> = {
  number: 'number',
  integer: 'number',
  boolean: 'boolean',
  string: 'string',
  color: 'color',
  enumType: 'enum',
  trigger: 'trigger',
};

type RiveProperty = { name: string; type: string };

const propertiesOf = (instance: ViewModelInstance | null): RiveProperty[] => {
  try {
    return (instance?.properties ?? []) as RiveProperty[];
  } catch {
    return [];
  }
};

/**
 * Data-bind properties on the bound view model, plus one level of nesting.
 *
 * One level is a deliberate stop: nested view models are how a file is
 * organised (`frog/hat`), and a full tree walk on a file that references
 * itself would never finish.
 */
function readDataBindInputs(rive: Rive): RiveInputInfo[] {
  const root = rive.viewModelInstance ?? null;
  if (!root) return [];

  const out: RiveInputInfo[] = [];

  const visit = (instance: ViewModelInstance, prefix: string, depth: number) => {
    for (const property of propertiesOf(instance)) {
      const path = prefix ? `${prefix}/${property.name}` : property.name;

      if (property.type === 'viewModel') {
        if (depth >= 1) continue;
        try {
          const child = instance.viewModel(property.name);
          if (child) visit(child, path, depth + 1);
        } catch {
          /* a view model that won't open is simply not offered */
        }
        continue;
      }

      const type = DATA_TYPE_TO_INPUT[property.type];
      if (!type) continue;

      let options: string[] | undefined;
      if (type === 'enum') {
        try {
          options = instance.enum(path)?.values ?? undefined;
        } catch {
          options = undefined;
        }
      }

      out.push({ name: path, type, target: 'databind', options });
    }
  };

  visit(root, '', 0);
  return out;
}

/** Plain state machine inputs, which older files use instead of data binding. */
function readStateMachineInputs(rive: Rive, stateMachine: string): RiveInputInfo[] {
  if (!stateMachine) return [];
  try {
    return rive.stateMachineInputs(stateMachine).flatMap((input) => {
      const type = SM_INPUT_TYPES[input.type as unknown as number];
      return type ? [{ name: input.name, type, target: 'statemachine' as const }] : [];
    });
  } catch {
    return [];
  }
}

export type RiveIntrospection = {
  artboards: RiveArtboardInfo[];
  inputs: RiveInputInfo[];
};

/**
 * What the file offers: every artboard with its state machines and its plain
 * timelines, and every value that can be written from the outside. This is the
 * whole reason an admin never has to type a name from memory.
 */
export function introspectRive(rive: Rive, stateMachine: string): RiveIntrospection {
  const artboards: RiveArtboardInfo[] = (rive.contents?.artboards ?? []).map((board) => ({
    name: board.name,
    stateMachines: (board.stateMachines ?? []).map((machine) => machine.name),
    animations: board.animations ?? [],
  }));

  const active =
    stateMachine ||
    artboards.find((board) => board.stateMachines.length)?.stateMachines[0] ||
    '';

  const inputs = [...readDataBindInputs(rive), ...readStateMachineInputs(rive, active)];

  const seen = new Set<string>();
  const unique = inputs.filter((input) => {
    const key = `${input.target}:${input.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { artboards, inputs: unique };
}

/** `#rrggbb` to the packed ARGB integer the runtime stores colours as. */
const packColor = (value: string) => {
  const hex = value.replace('#', '');
  const full =
    hex.length === 3
      ? hex
          .split('')
          .map((char) => char + char)
          .join('')
      : hex;
  const int = Number.parseInt(full.slice(0, 6), 16);
  if (!Number.isFinite(int)) return null;
  return (0xff << 24) | int;
};

function writeDataBind(instance: ViewModelInstance, input: RiveInputValue): boolean {
  switch (input.type) {
    case 'number': {
      const property = instance.number(input.name);
      if (!property) return false;
      property.value = Number(input.value) || 0;
      return true;
    }
    case 'boolean': {
      const property = instance.boolean(input.name);
      if (!property) return false;
      property.value = input.value === true || input.value === 'true';
      return true;
    }
    case 'string': {
      const property = instance.string(input.name);
      if (!property) return false;
      property.value = String(input.value ?? '');
      return true;
    }
    case 'enum': {
      const property = instance.enum(input.name);
      if (!property) return false;
      property.value = String(input.value ?? '');
      return true;
    }
    case 'color': {
      const packed = packColor(String(input.value ?? ''));
      const property = instance.color(input.name);
      if (!property || packed === null) return false;
      property.value = packed;
      return true;
    }
    default:
      return false;
  }
}

/**
 * The same property is often spelled differently on each side of a file — a
 * `handItem` data-bind property beside a `hand_item` state machine input.
 */
const nameVariants = (name: string) => {
  const snake = name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
  const camel = name.replace(/_([a-z0-9])/g, (_, char: string) => char.toUpperCase());
  return Array.from(new Set([name, snake, camel]));
};

/** The state machine's own name if the caller knows it, else every one the
 *  file has — the artboard is what matters, not which machine was named. */
function machineNames(rive: Rive, stateMachine: string): string[] {
  if (stateMachine) return [stateMachine];
  try {
    return (rive.contents?.artboards ?? []).flatMap((board) =>
      (board.stateMachines ?? []).map((machine) => machine.name),
    );
  } catch {
    return [];
  }
}

export function findStateMachineInput(
  rive: Rive,
  stateMachine: string,
  name: string,
) {
  const variants = nameVariants(name);
  for (const machine of machineNames(rive, stateMachine)) {
    try {
      const all = rive.stateMachineInputs(machine);
      for (const variant of variants) {
        const found = all.find((candidate) => candidate.name === variant);
        if (found) return found;
      }
    } catch {
      /* a machine this artboard doesn't have has no inputs to find */
    }
  }
  return null;
}

function writeStateMachine(
  rive: Rive,
  stateMachine: string,
  input: RiveInputValue,
): boolean {
  const target = findStateMachineInput(rive, stateMachine, input.name);
  if (!target) return false;
  if (input.type === 'boolean') {
    target.value = input.value === true || input.value === 'true';
    return true;
  }
  if (input.type === 'number') {
    target.value = Number(input.value) || 0;
    return true;
  }
  return false;
}

const debugging = () => {
  if (process.env.NODE_ENV === 'production') return false;
  try {
    return window.localStorage.getItem('riveDebug') === '1';
  } catch {
    return false;
  }
};

/** Reads a value straight back out, to tell a failed write from a failed draw. */
function readBack(instance: ViewModelInstance | null, input: RiveInputValue) {
  if (!instance) return 'no-instance';
  try {
    switch (input.type) {
      case 'number':
        return instance.number(input.name)?.value ?? 'missing';
      case 'boolean':
        return instance.boolean(input.name)?.value ?? 'missing';
      case 'string':
        return instance.string(input.name)?.value ?? 'missing';
      case 'enum':
        return instance.enum(input.name)?.value ?? 'missing';
      default:
        return 'n/a';
    }
  } catch {
    return 'threw';
  }
}

/**
 * Restart the render loop after writing to a file.
 *
 * A loop-free artboard settles: once the state machine has nothing left to
 * advance, the runtime cancels its own animation frame. A value written or a
 * trigger fired after that point is stored correctly and never drawn, which
 * looks exactly like the write failing — it only appears on the next reload,
 * when the file is rendering again. `startRendering` is a no-op while the loop
 * is already running, so this costs nothing in the common case.
 */
export function wakeRive(rive: Rive): void {
  try {
    rive.startRendering();
  } catch {
    /* a runtime that is mid-teardown has nothing to wake */
  }
}

/**
 * Push every admin-set value into the file.
 *
 * Both halves are written, not only the one the value was discovered on: a
 * .riv commonly carries a data-bind property *and* a legacy state machine
 * input for the same thing, and which of the two actually drives the artwork
 * differs per property — the app's own frog sets both for every wardrobe slot.
 * Writing only the discovered half is how a value saves correctly and still
 * changes nothing on screen.
 */
export function applyRiveInputs(
  rive: Rive,
  stateMachine: string,
  inputs: RiveInputValue[],
): void {
  const instance = rive.viewModelInstance ?? null;
  const log = debugging();

  for (const input of inputs) {
    if (!input.name || input.type === 'trigger') continue;

    let bound = false;
    let machine = false;
    try {
      if (instance) bound = writeDataBind(instance, input);
    } catch {
      /* a name the file doesn't have is a no-op, never a crash */
    }
    try {
      machine = writeStateMachine(rive, stateMachine, input);
    } catch {
      /* likewise for the state machine half */
    }

    if (log) {
      console.log(
        `[rive] set ${input.name}=${String(input.value)} (${input.type}) ` +
          `databind:${bound ? 'ok' : 'miss'} statemachine:${machine ? 'ok' : 'miss'} ` +
          `readback:${String(readBack(instance, input))}`,
      );
    }
  }
}

/** Fire one trigger by name, whichever half of the file owns it. */
export function fireRiveTrigger(
  rive: Rive,
  stateMachine: string,
  name: string,
  target: RiveInputTarget,
): void {
  if (!name) return;

  let bound = false;
  let machine = false;

  try {
    const property = rive.viewModelInstance?.trigger(name);
    if (property) {
      property.trigger();
      bound = true;
    }
  } catch {
    /* a trigger the file doesn't have is a no-op */
  }

  try {
    const input = findStateMachineInput(rive, stateMachine, name);
    if (input?.fire) {
      input.fire();
      machine = true;
    }
  } catch {
    /* likewise for the state machine half */
  }

  if (debugging()) {
    console.log(
      `[rive] fire ${name} (asked for ${target}) ` +
        `databind:${bound ? 'ok' : 'miss'} statemachine:${machine ? 'ok' : 'miss'}`,
    );
  }
}
