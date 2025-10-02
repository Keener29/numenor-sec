import { useState, type ReactNode } from 'react';

interface DropdownProps {
  title: string;
  children: ReactNode;
  isExpanded: boolean;
  onToggle: () => void;
  className?: string;
  headerContent?: ReactNode;
  rightAction?: ReactNode;
}

export default function Dropdown({ 
  title, 
  children, 
  isExpanded, 
  onToggle, 
  className = "",
  headerContent,
  rightAction
}: DropdownProps) {
  return (
    <div className={`border border-gray-200 rounded-lg ${className}`}>
      {/* Header - Clickable */}
      <div className="px-4 py-3 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors flex items-center justify-between">
        <button
          onClick={onToggle}
          className="flex items-center space-x-6 flex-1 min-w-0 border-0 cursor-pointer bg-transparent h-full"
        >
          <div className="text-sm font-medium text-gray-900 truncate">
            {title}
          </div>
          {headerContent}
        </button>
        <div className="flex items-center space-x-3 flex-shrink-0 h-full">
          {rightAction}
          <button
            onClick={onToggle}
            className="border-0 cursor-pointer bg-transparent p-1"
          >
            <svg
              className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>
      
      {/* Collapsible Content */}
      {isExpanded && (
        <div className="px-4 py-3 border-t border-gray-200">
          {children}
        </div>
      )}
    </div>
  );
}
