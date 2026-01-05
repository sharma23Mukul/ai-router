import React from 'react';
import { motion } from 'framer-motion';
import Sparkline from './Sparkline';
import CountUp from './CountUp';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

const StatCard = ({ title, value, icon: Icon, trend, trendValue, sparklineData, color = "blue", prefix = "", suffix = "", decimals = 0 }) => {
    const isPositive = trend === 'up';
    const trendColor = isPositive ? 'text-emerald-400' : 'text-rose-400';
    const TrendIcon = isPositive ? ArrowUpRight : ArrowDownRight;

    // Parse numeric value from string if needed, or use raw value if passed as number
    const numericValue = typeof value === 'string' ? parseFloat(value.replace(/[^0-9.-]+/g, "")) : value;

    return (
        <motion.div
            whileHover={{ y: -4, boxShadow: "0 10px 30px -10px rgba(0,0,0,0.5)" }}
            className="glass-card p-6 rounded-2xl relative overflow-hidden group border border-white/5"
        >
            {/* Watermark Icon */}
            <div className="absolute -bottom-4 -right-4 text-white/[0.03] group-hover:text-white/[0.07] transition-all duration-500 rotate-12 scale-150 pointer-events-none">
                <Icon size={120} />
            </div>

            <div className="flex justify-between items-start mb-4 relative z-10">
                <div className={`p-3 rounded-xl border border-white/10 ${color === 'blue' ? 'bg-blue-500/10 text-blue-400' :
                        color === 'emerald' ? 'bg-emerald-500/10 text-emerald-400' :
                            'bg-yellow-500/10 text-yellow-400'
                    }`}>
                    <Icon size={24} />
                </div>
                {sparklineData && <Sparkline data={sparklineData} color={isPositive ? "#34d399" : "#fb7185"} />}
            </div>

            <div className="relative z-10">
                <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1 opacity-80">{title}</h3>
                <div className="flex items-baseline gap-3">
                    <span className="text-3xl font-black text-white tracking-tight">
                        <CountUp end={numericValue} decimals={decimals} prefix={prefix} suffix={suffix} />
                    </span>
                    <div className={`flex items-center gap-1 text-xs font-bold ${trendColor} mb-1 px-2 py-0.5 bg-white/5 rounded-full border border-white/5`}>
                        <TrendIcon size={12} />
                        <span>{trendValue}</span>
                    </div>
                </div>
            </div>
        </motion.div>
    );
};

export default StatCard;
