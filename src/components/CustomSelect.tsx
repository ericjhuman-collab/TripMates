import React, { useState, useRef, useEffect } from 'react';
import styles from './CustomSelect.module.css';

export interface SelectOption {
    value: string;
    label: string;
    subLabel?: string;
}

interface CustomSelectProps {
    value: string;
    onChange: (value: string) => void;
    options: SelectOption[];
    placeholder?: string;
    className?: string;
}

export const CustomSelect: React.FC<CustomSelectProps> = ({
    value,
    onChange,
    options,
    placeholder = 'Select...',
    className = ''
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const dropdownRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Auto-hide search if 5 or fewer items
    const showSearch = options.length > 5;

    // Handle click outside to close dropdown
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            // Focus search input when opened
            if (showSearch) {
                setTimeout(() => searchInputRef.current?.focus(), 10);
            }
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen, showSearch]);

    const filteredOptions = showSearch 
        ? options.filter(opt => 
            opt.label.toLowerCase().includes(searchQuery.toLowerCase()) || 
            opt.value.toLowerCase().includes(searchQuery.toLowerCase()) ||
            opt.subLabel?.toLowerCase().includes(searchQuery.toLowerCase())
          )
        : options;

    const selectedOption = options.find(opt => opt.value === value);

    const handleSelect = (selectedValue: string) => {
        onChange(selectedValue);
        setIsOpen(false);
        setSearchQuery('');
    };

    return (
        <div className={`${styles.selectorContainer} ${isOpen ? styles.selectorOpen : ''} ${className}`} ref={dropdownRef}>
            <div 
                className={styles.selectField} 
                onClick={() => setIsOpen(!isOpen)}
            >
                <div>
                    {selectedOption ? selectedOption.label : placeholder}
                </div>
                <div className={styles.selectCaret}>▼</div>
            </div>

            {isOpen && (
                <div className={styles.dropdownPopup}>
                    {showSearch && (
                        <input 
                            ref={searchInputRef}
                            type="text"
                            placeholder="Search..."
                            className={styles.searchInput}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                        />
                    )}
                    <div className={styles.dropdownList}>
                        {filteredOptions.length > 0 ? (
                            filteredOptions.map(opt => (
                                <div 
                                    key={opt.value}
                                    className={styles.dropdownItem}
                                    onClick={() => handleSelect(opt.value)}
                                >
                                    <span className={`${styles.itemLabel} ${opt.subLabel ? styles.itemLabelCode : ''}`}>
                                        {opt.label}
                                    </span>
                                    {opt.subLabel && (
                                        <span className={styles.itemSubLabel}>{opt.subLabel}</span>
                                    )}
                                </div>
                            ))
                        ) : (
                            <div className={styles.dropdownEmpty}>No items found</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
