import { useId, useMemo, useRef, useState } from 'react';
import type { Customer } from '../lib/studioEntries';

/**
 * Type to filter the customer list, pick one, or add a new name. The list
 * is the Orders app's active buyers plus names the studio has added.
 */
export function CustomerPicker({
  value, customers, onChange, onAdd, loading, autoFocus,
}: {
  value: Customer | null;
  customers: Customer[];
  onChange: (c: Customer | null) => void;
  /** Saves a new name for everyone and selects it. */
  onAdd: (name: string) => Promise<void> | void;
  loading?: boolean;
  autoFocus?: boolean;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(value?.name || '');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const term = text.trim().toLowerCase();
  const matches = useMemo(
    () => (term ? customers.filter((c) => c.name.toLowerCase().includes(term) || (c.code || '').toLowerCase().includes(term)) : customers).slice(0, 60),
    [customers, term]
  );
  const exact = customers.find((c) => c.name.toLowerCase() === term);
  const canAdd = !!term && !exact;
  const count = matches.length + (canAdd ? 1 : 0);

  const pick = (c: Customer) => { onChange(c); setText(c.name); setOpen(false); };
  const add = async () => {
    const name = text.trim();
    if (!name) return;
    await onAdd(name);
    onChange({ name, code: null });
    setText(name);
    setOpen(false);
  };
  const choose = (i: number) => (i < matches.length ? pick(matches[i]) : add());

  return (
    <div className="relative">
      <input
        ref={input}
        id={`${id}-input`}
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={open && count ? `${id}-opt-${active}` : undefined}
        autoFocus={autoFocus}
        autoComplete="off"
        value={text}
        placeholder={loading ? 'Loading customers…' : 'Type to search, or add a new one'}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => {
          setOpen(false);
          // typed an existing name exactly without picking it: take it
          if (!value || value.name !== text.trim()) {
            const hit = customers.find((c) => c.name.toLowerCase() === text.trim().toLowerCase());
            if (hit) pick(hit); else if (value) onChange(null);
          }
        }, 120)}
        onChange={(e) => { setText(e.target.value); setOpen(true); setActive(0); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, count - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === 'Enter' && open && count) { e.preventDefault(); e.stopPropagation(); choose(active); }
          else if (e.key === 'Escape' && open) { e.nativeEvent.stopImmediatePropagation(); setOpen(false); }
        }}
        className="mt-1 w-full border-b border-neutral-200 bg-transparent pb-1.5 text-[15px] outline-none focus:border-[#2F4C69]"
      />
      {value?.code && value.name === text.trim() && (
        <span className="mt-1 block text-[11.5px] text-neutral-400">Buyer code {value.code}</span>
      )}
      {open && count > 0 && (
        <ul id={`${id}-list`} role="listbox"
          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-sm border border-neutral-200 bg-white py-1 shadow-lg">
          {matches.map((c, i) => (
            <li key={c.name} id={`${id}-opt-${i}`} role="option" aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); pick(c); }}
              onMouseEnter={() => setActive(i)}
              className={'flex cursor-pointer items-baseline gap-2 px-3 py-2 text-[14px] ' + (i === active ? 'bg-neutral-100' : '')}>
              <span className="flex-1">{c.name}</span>
              {c.code && <span className="text-[11.5px] text-neutral-400">{c.code}</span>}
            </li>
          ))}
          {canAdd && (
            <li id={`${id}-opt-${matches.length}`} role="option" aria-selected={active === matches.length}
              onMouseDown={(e) => { e.preventDefault(); add(); }}
              onMouseEnter={() => setActive(matches.length)}
              className={'cursor-pointer px-3 py-2 text-[14px] font-semibold text-[#2F4C69] ' + (active === matches.length ? 'bg-neutral-100' : '')}>
              + Add {text.trim()} as a new customer
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
