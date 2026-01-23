import React from 'react';
import { motion } from 'framer-motion';
import clsx from 'clsx';

const SegmentedControl = ({ options, selected, onChange }) => {
    return (
        <div className="flex bg-slate-900/50 backdrop-blur-md p-1 rounded-xl border border-white/10 relative">
            {options.map((option) => {
                const isSelected = selected === option.value;
                return (
                    <button
                        key={option.value}
                        onClick={() => onChange(option.value)}
                        className={clsx(
                            "relative px-4 py-2 text-sm font-medium rounded-lg transition-colors z-10",
                            isSelected ? "text-white" : "text-slate-400 hover:text-slate-200"
                        )}
                    >
                        {isSelected && (
                            <motion.div
                                layoutId="activeSegment"
                                className="absolute inset-0 bg-white/10 rounded-lg border border-white/10 shadow-sm"
                                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                            />
                        )}
                        <span className="relative z-10">{option.label}</span>
                    </button>
                );
            })}
        </div>
    );
};

export default SegmentedControl;
