<script setup lang="ts">
/**
 * Two-handle horizontal range slider.
 *
 * Used by the price filter and by every numeric parametric filter, so they all
 * behave and look the same. The handles work in slider steps internally and the
 * component emits real values, which keeps the mapping - including the
 * logarithmic one - in a single place.
 */
import { computed, ref, watch } from 'vue';

const props = withDefaults(defineProps<{
  /** Lower bound of what the current result set contains. */
  min: number;
  /** Upper bound of what the current result set contains. */
  max: number;
  /** Currently selected range; null means "not filtered". */
  from?: number | null;
  to?: number | null;
  /** Accessible name, used to label the two handles. */
  name: string;
  /** Map a wide range logarithmically (see below). */
  logarithmic?: boolean;
  format?: (value: number) => string;
}>(), {
  from: null,
  to: null,
  logarithmic: false,
});

const emit = defineEmits<{
  (e: 'change', range: { from: number; to: number }): void;
}>();

const STEPS = 1000;

// A linear slider across 425 kr - 122 500 000 kr puts everything below a
// million into the first few pixels. Wide ranges are mapped logarithmically
// instead, but only when the span actually warrants it and min is positive.
const useLog = computed(() => props.logarithmic && props.min > 0 && props.max / props.min > 100);

const hasRange = computed(() => Number.isFinite(props.min) && Number.isFinite(props.max) && props.max > props.min);

function toValue(step: number): number {
  const ratio = step / STEPS;
  if (useLog.value) {
    const minLog = Math.log(props.min);
    return Math.round(Math.exp(minLog + (Math.log(props.max) - minLog) * ratio));
  }
  return Math.round(props.min + (props.max - props.min) * ratio);
}

function toStep(value: number): number {
  if (!hasRange.value) return 0;
  const clamped = Math.min(Math.max(value, props.min), props.max);
  const ratio = useLog.value
      ? (Math.log(clamped) - Math.log(props.min)) / (Math.log(props.max) - Math.log(props.min))
      : (clamped - props.min) / (props.max - props.min);
  return Math.round(ratio * STEPS);
}

const lower = ref(0);
const upper = ref(STEPS);

// Follow the bounds Norce reports for the current result set, and reset when the
// selection is cleared from outside.
watch(
    () => [props.min, props.max, props.from, props.to],
    () => {
      lower.value = props.from == null ? 0 : toStep(props.from);
      upper.value = props.to == null ? STEPS : toStep(props.to);
    },
    { immediate: true }
);

// The handles can be dragged past each other, so read them as a sorted pair
// rather than trusting which input is which.
const lowerValue = computed(() => toValue(Math.min(lower.value, upper.value)));
const upperValue = computed(() => toValue(Math.max(lower.value, upper.value)));

const fillStyle = computed(() => {
  const start = (Math.min(lower.value, upper.value) / STEPS) * 100;
  const end = (Math.max(lower.value, upper.value) / STEPS) * 100;
  return { left: `${start}%`, width: `${end - start}%` };
});

function label(value: number) {
  return props.format ? props.format(value) : String(value);
}

function commit() {
  emit('change', { from: lowerValue.value, to: upperValue.value });
}
</script>

<template>
  <!-- A single-value range has nothing to drag; show the value instead. -->
  <p v-if="!hasRange" class="range-single">{{ label(min) }}</p>

  <div v-else class="range">
    <div class="range-track">
      <div class="range-fill" :style="fillStyle"></div>

      <input
          v-model.number="lower"
          class="range-input"
          type="range"
          min="0"
          :max="STEPS"
          :aria-label="`${name} min`"
          @change="commit"
      />
      <input
          v-model.number="upper"
          class="range-input"
          type="range"
          min="0"
          :max="STEPS"
          :aria-label="`${name} max`"
          @change="commit"
      />
    </div>

    <div class="range-labels">
      <span>{{ label(lowerValue) }}</span>
      <span>{{ label(upperValue) }}</span>
    </div>
  </div>
</template>

<style scoped>
.range-single {
  margin: 0;
  color: #666;
}

.range-track {
  position: relative;
  height: 1.5rem;
}

/* The grey rail. Inset by half a thumb so the handles stay inside the track. */
.range-track::before {
  content: "";
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  height: 4px;
  transform: translateY(-50%);
  background: #e6e6e6;
  border-radius: 999px;
}

.range-fill {
  position: absolute;
  top: 50%;
  height: 4px;
  transform: translateY(-50%);
  background: var(--primary);
  border-radius: 999px;
}

/* Both inputs sit on top of each other; only the thumbs take pointer events so
   whichever handle you aim at is the one you get. */
.range-input {
  position: absolute;
  inset: 0;
  width: 100%;
  margin: 0;
  background: transparent;
  pointer-events: none;
  -webkit-appearance: none;
  appearance: none;
}

.range-input:focus {
  outline: none;
}

.range-input::-webkit-slider-runnable-track {
  background: transparent;
  border: 0;
}

.range-input::-moz-range-track {
  background: transparent;
  border: 0;
}

.range-input::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 1rem;
  height: 1rem;
  border-radius: 50%;
  background: #fff;
  border: 2px solid var(--primary);
  cursor: grab;
  pointer-events: auto;
}

.range-input::-moz-range-thumb {
  width: 1rem;
  height: 1rem;
  border-radius: 50%;
  background: #fff;
  border: 2px solid var(--primary);
  cursor: grab;
  pointer-events: auto;
}

.range-input:focus-visible::-webkit-slider-thumb {
  box-shadow: 0 0 0 3px rgba(230, 57, 70, 0.25);
}

.range-labels {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  margin-top: 0.15rem;
  font-variant-numeric: tabular-nums;
  color: #444;
}
</style>
