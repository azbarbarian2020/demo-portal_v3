"use client";

interface FilterBarProps {
  search: string;
  onSearchChange: (val: string) => void;
  selectedTopics: string[];
  onTopicsChange: (val: string[]) => void;
  selectedCapabilities: string[];
  onCapabilitiesChange: (val: string[]) => void;
  topics: string[];
  capabilities: string[];
}

function MultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (val: string[]) => void;
}) {
  return (
    <div className="relative">
      <label className="text-xs font-medium text-gray-500 block mb-1">{label}</label>
      <div className="flex flex-wrap gap-1">
        {options.map((opt) => {
          const isSelected = selected.includes(opt);
          return (
            <button
              key={opt}
              onClick={() =>
                onChange(
                  isSelected
                    ? selected.filter((s) => s !== opt)
                    : [...selected, opt]
                )
              }
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                isSelected
                  ? "bg-[var(--sf-blue)] text-white border-[var(--sf-blue)]"
                  : "bg-white text-gray-600 border-gray-200 hover:border-[var(--sf-blue)]"
              }`}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function FilterBar({
  search,
  onSearchChange,
  selectedTopics,
  onTopicsChange,
  selectedCapabilities,
  onCapabilitiesChange,
  topics,
  capabilities,
}: FilterBarProps) {
  const hasFilters = search || selectedTopics.length > 0 || selectedCapabilities.length > 0;

  return (
    <div className="space-y-3">
      <div className="flex gap-3 items-center">
        <div className="relative flex-1 max-w-md">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search demos..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--sf-blue)] focus:border-transparent"
          />
        </div>
        {hasFilters && (
          <button
            onClick={() => {
              onSearchChange("");
              onTopicsChange([]);
              onCapabilitiesChange([]);
            }}
            className="text-xs text-gray-500 hover:text-gray-700 underline"
          >
            Clear all
          </button>
        )}
      </div>
      <div className="flex gap-6 flex-wrap">
        <MultiSelect
          label="Topic"
          options={topics}
          selected={selectedTopics}
          onChange={onTopicsChange}
        />
        <MultiSelect
          label="Capability"
          options={capabilities}
          selected={selectedCapabilities}
          onChange={onCapabilitiesChange}
        />
      </div>
    </div>
  );
}
