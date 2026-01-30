'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Filter, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FilterOption<T extends string = string> {
  value: T;
  label: string;
}

interface MultiSelectDropdownProps<T extends string = string> {
  options: FilterOption<T>[];
  selected: Set<T>;
  onChange: (selected: Set<T>) => void;
  allValue?: T;
  placeholder?: string;
}

export function MultiSelectDropdown<T extends string = string>({
  options,
  selected,
  onChange,
  allValue = 'all' as T,
  placeholder = 'Filter',
}: MultiSelectDropdownProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleToggle = (value: T) => {
    const newSelected = new Set(selected);

    if (value === allValue) {
      // Selecting "all" clears other selections
      onChange(new Set([allValue]));
    } else {
      // Remove "all" if selecting specific filter
      newSelected.delete(allValue);

      if (newSelected.has(value)) {
        newSelected.delete(value);
      } else {
        newSelected.add(value);
      }

      // If nothing selected, default to "all"
      if (newSelected.size === 0) {
        newSelected.add(allValue);
      }

      onChange(newSelected);
    }
  };

  const getDisplayText = () => {
    if (selected.has(allValue) || selected.size === 0) {
      const allOption = options.find(o => o.value === allValue);
      return allOption?.label || 'All';
    }
    if (selected.size === 1) {
      const option = options.find(o => selected.has(o.value));
      return option?.label || placeholder;
    }
    return `${selected.size} selected`;
  };

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 text-sm border rounded-lg transition-colors',
          isOpen
            ? 'border-blue-400 bg-blue-50'
            : 'border-gray-300 hover:bg-gray-50'
        )}
      >
        <Filter className="w-4 h-4 text-gray-500" />
        <span className="text-gray-700">{getDisplayText()}</span>
        <ChevronDown className={cn('w-4 h-4 text-gray-400 transition-transform', isOpen && 'rotate-180')} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-20">
          {options.map((option) => {
            const isChecked = selected.has(option.value);
            return (
              <label
                key={option.value}
                className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer first:rounded-t-lg last:rounded-b-lg"
              >
                <div
                  className={cn(
                    'w-4 h-4 rounded border flex items-center justify-center transition-colors',
                    isChecked
                      ? 'bg-blue-600 border-blue-600'
                      : 'border-gray-300 bg-white'
                  )}
                >
                  {isChecked && <Check className="w-3 h-3 text-white" />}
                </div>
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => handleToggle(option.value)}
                  className="sr-only"
                />
                <span className="text-sm text-gray-700">{option.label}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
