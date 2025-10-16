export function formatSeconds(value) {
  const amount = Number(value);
  if (Number.isNaN(amount)) {
    return '0.000s';
  }
  if (amount >= 1) {
    return `${amount.toFixed(2)}s`;
  }
  return `${amount.toFixed(3)}s`;
}

export function formatLevel(value) {
  const amount = Number(value);
  if (Number.isNaN(amount)) {
    return '0.00';
  }
  return amount.toFixed(2);
}

export function formatFrequency(value) {
  const amount = Number(value);
  if (Number.isNaN(amount)) {
    return '0 Hz';
  }
  if (amount >= 1000) {
    return `${(amount / 1000).toFixed(2)} kHz`;
  }
  return `${amount.toFixed(0)} Hz`;
}

export function formatHertz(value) {
  const amount = Number(value);
  if (Number.isNaN(amount)) {
    return '0.00 Hz';
  }
  return `${amount.toFixed(2)} Hz`;
}

export function formatPercent(value) {
  const amount = Number(value);
  if (Number.isNaN(amount)) {
    return '0%';
  }
  return `${Math.round(amount * 100)}%`;
}

export function formatMilliseconds(value) {
  const amount = Number(value);
  if (Number.isNaN(amount)) {
    return '0 ms';
  }
  const ms = amount * 1000;
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(2)} s`;
  }
  return `${ms.toFixed(ms < 100 ? 1 : 0)} ms`;
}

export function formatImuValue(value, digits = 2, suffix = '') {
  if (value == null || Number.isNaN(value)) {
    return '--';
  }
  return `${Number(value).toFixed(digits)}${suffix}`;
}
