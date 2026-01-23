import React from 'react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';

const Sparkline = ({ data, color = "#10b981" }) => {
    // Generate simple mock data if none provided, or map provided data
    const chartData = data && data.length > 0
        ? data
        : Array.from({ length: 10 }, (_, i) => ({ value: 50 + Math.random() * 30 }));

    return (
        <div className="h-10 w-24">
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                    <Line
                        type="monotone"
                        dataKey="value"
                        stroke={color}
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={true}
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
};

export default Sparkline;
