import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, Leaf, DollarSign, Zap, Server, Cpu, ArrowRight, CheckCircle, AlertCircle, ChevronDown, ChevronUp, Network, Brain, Shield } from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import StatCard from './StatCard';
import SegmentedControl from './SegmentedControl';
import '../App.css';

// Configurable API base URL
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const Dashboard = () => {
    const [stats, setStats] = useState({
        totalRequests: 0,
        totalCost: 0,
        totalEnergy: 0,
        avgLatency: 0,
        cacheHits: 0,
        cacheHitRate: 0
    });
    const [logs, setLogs] = useState([]);
    const [modelStats, setModelStats] = useState([]);
    const [config, setConfig] = useState({
        strategies: [],
        models: {}
    });
    const [activeStrategy, setActiveStrategy] = useState('cost-first');
    const [chatInput, setChatInput] = useState('');
    const [chatResponse, setChatResponse] = useState(null);
    const [loading, setLoading] = useState(false);
    const [expandedLogId, setExpandedLogId] = useState(null);

    // Smart Placeholder Rotation
    const placeholders = [
        "How do I explain quantum computing to a 5-year-old?",
        "Write a Python script to optimize database queries...",
        "Analyze the sentiment of this customer review...",
        "Generate a marketing strategy for a new coffee brand..."
    ];
    const [placeholderIndex, setPlaceholderIndex] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setPlaceholderIndex(prev => (prev + 1) % placeholders.length);
        }, 3000);
        return () => clearInterval(interval);
    }, []);

    const fetchStats = async () => {
        try {
            const res = await axios.get(`${API_BASE}/api/stats`);
            setStats(res.data.stats || {});
            setLogs(res.data.recentLogs || []);
            setModelStats(res.data.modelStats || []);
        } catch (err) {
            console.error("Error fetching stats", err);
        }
    };

    const fetchConfig = async () => {
        try {
            const res = await axios.get(`${API_BASE}/api/config`);
            setConfig(res.data);
        } catch (err) {
            console.error("Error fetching config", err);
        }
    };

    useEffect(() => {
        fetchStats();
        fetchConfig();
        const interval = setInterval(fetchStats, 5000);
        return () => clearInterval(interval);
    }, []);

    const handleChatSubmit = async (e) => {
        e.preventDefault();
        if (!chatInput.trim()) return;
        setLoading(true);
        setChatResponse(null);
        try {
            const res = await axios.post(`${API_BASE}/v1/chat/completions`, {
                messages: [{ role: 'user', content: chatInput }],
                strategy: activeStrategy
            });
            setChatResponse(res.data);
            fetchStats();
        } catch (err) {
            console.error("Chat error", err);
            setChatResponse({ error: "Failed to get response" });
        }
        setLoading(false);
    };

    const toggleLogExpansion = (id) => {
        setExpandedLogId(expandedLogId === id ? null : id);
    };

    // Data handling
    const pieData = modelStats.length > 0
        ? modelStats.map(m => ({ name: m.model_selected, value: m.count }))
        : [];

    if (pieData.length === 0 && logs.length > 0) {
        const counts = {};
        logs.forEach(l => counts[l.model_selected] = (counts[l.model_selected] || 0) + 1);
        Object.entries(counts).forEach(([k, v]) => pieData.push({ name: k, value: v }));
    }

    const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

    const strategyOptions = config.strategies.map(s => ({
        value: s,
        label: s.replace('-', ' ').replace(/\b\w/g, c => c.toUpperCase())
    }));

    // Complexity Color Scale
    const getComplexityColor = (score) => {
        if (score <= 3) return 'bg-emerald-500';
        if (score <= 7) return 'bg-yellow-500';
        if (score <= 11) return 'bg-orange-500';
        return 'bg-rose-500';
    };

    return (
        <div className="p-8 max-w-[1600px] mx-auto space-y-8 relative z-10 font-sans">
            {/* Spotlight Gradient */}
            <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-blue-500/10 blur-[120px] rounded-full pointer-events-none -z-10" />

            {/* Header */}
            <header className="flex flex-col md:flex-row justify-between items-center gap-6">
                <div className="relative">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 0.5 }}
                        className="absolute -inset-4 bg-blue-500/20 blur-xl rounded-full"
                    />
                    <h1 className="text-4xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-white via-blue-100 to-slate-400 mb-1 relative z-10">
                        AI ROUTER
                    </h1>
                    <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        <p className="text-slate-400 font-medium tracking-wide text-xs uppercase relative z-10">
                            Intelligent Infrastructure v1.0
                            <motion.span
                                className="absolute bottom-0 left-0 w-full h-[1px] bg-blue-500/50"
                                initial={{ scaleX: 0 }}
                                animate={{ scaleX: 1 }}
                                transition={{ delay: 1, duration: 1 }}
                            />
                        </p>
                    </div>
                </div>

                <SegmentedControl
                    options={strategyOptions.length > 0 ? strategyOptions : [{ value: 'loading', label: 'Loading...' }]}
                    selected={activeStrategy}
                    onChange={setActiveStrategy}
                />
            </header>

            {/* Hero Playground */}
            <section className="glass-panel rounded-2xl p-1 relative overflow-hidden ring-1 ring-white/10 group hover:ring-white/20 transition-all duration-500">
                <div className="absolute inset-0 bg-gradient-to-tr from-blue-500/5 to-purple-500/5 pointer-events-none" />
                <div className="bg-slate-950/80 backdrop-blur-xl rounded-xl p-6 md:p-8">
                    <form onSubmit={handleChatSubmit} className="relative z-10">
                        <div className="flex flex-col md:flex-row gap-6">
                            <div className="flex-1 relative group">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex justify-between items-center">
                                    <span>Prompt Engineering Playground</span>
                                    <span className="text-[10px] bg-white/5 px-2 py-0.5 rounded border border-white/5 text-slate-400">Ctrl + Enter to run</span>
                                </label>
                                <div className="relative">
                                    <textarea
                                        value={chatInput}
                                        onChange={(e) => setChatInput(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.ctrlKey && e.key === 'Enter') handleChatSubmit(e);
                                        }}
                                        placeholder=""
                                        className="w-full bg-slate-900/50 border border-slate-800 rounded-xl p-4 text-slate-100 placeholder:text-slate-600 focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 outline-none min-h-[160px] transition-all resize-none shadow-inner text-lg font-medium leading-relaxed font-mono"
                                    />
                                    {!chatInput && (
                                        <div className="absolute top-4 left-4 pointer-events-none text-slate-600 font-medium text-lg font-mono">
                                            <AnimatePresence mode="wait">
                                                <motion.span
                                                    key={placeholderIndex}
                                                    initial={{ opacity: 0, y: 10 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    exit={{ opacity: 0, y: -10 }}
                                                    transition={{ duration: 0.3 }}
                                                >
                                                    {placeholders[placeholderIndex]}
                                                </motion.span>
                                            </AnimatePresence>
                                        </div>
                                    )}
                                </div>
                                <div className="absolute bottom-4 right-4 flex items-center gap-2">
                                    <motion.button
                                        whileTap={{ scale: 0.95 }}
                                        type="submit"
                                        disabled={loading}
                                        className="bg-white text-slate-950 px-6 py-2 rounded-lg font-bold hover:bg-slate-200 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-cyan-500/20"
                                    >
                                        {loading ? <Activity className="animate-spin" size={18} /> : <Zap size={18} className="fill-slate-950" />}
                                        {loading ? 'Processing...' : 'Run Request'}
                                    </motion.button>
                                </div>
                            </div>

                            <AnimatePresence>
                                {chatResponse && (
                                    <motion.div
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -20 }}
                                        className="flex-1 bg-slate-900/50 border border-slate-800 rounded-xl p-6 relative overflow-hidden flex flex-col"
                                    >
                                        <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-blue-500 to-purple-500" />

                                        {chatResponse.error ? (
                                            <div className="flex items-center gap-3 text-rose-400 font-bold h-full justify-center">
                                                <AlertCircle /> {chatResponse.error}
                                            </div>
                                        ) : (
                                            <>
                                                <div className="flex justify-between items-start mb-4 pb-4 border-b border-white/5">
                                                    <div className="flex items-center gap-2">
                                                        <CheckCircle size={16} className="text-emerald-400" />
                                                        <span className="text-sm font-bold text-slate-200">{chatResponse.model || 'Unknown Model'}</span>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <span className="bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-1 rounded text-xs font-bold font-mono">
                                                            Score: {chatResponse._routing?.routingScore}
                                                        </span>
                                                        <span className="bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2 py-1 rounded text-xs font-bold capitalize">
                                                            {chatResponse._routing?.intent}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                                                    <p className="text-slate-300 leading-relaxed whitespace-pre-wrap font-mono text-sm">{chatResponse.choices?.[0]?.message?.content}</p>
                                                </div>

                                                <div className="mt-4 pt-3 border-t border-white/5 flex justify-between items-center text-xs">
                                                    <div className="flex gap-4">
                                                        <div>
                                                            <span className="text-slate-500 block mb-0.5">Estimated Cost</span>
                                                            <span className="text-emerald-400 font-mono font-bold">${chatResponse._routing?.cost?.toFixed(6)}</span>
                                                        </div>
                                                        <div>
                                                            <span className="text-slate-500 block mb-0.5">Latency</span>
                                                            <span className="text-blue-400 font-mono font-bold">{chatResponse._routing?.latencyMs}ms</span>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <span className="text-slate-500 block mb-0.5">Complexity</span>
                                                        <div className="flex items-center gap-1">
                                                            <div className={`w-2 h-2 rounded-full ${getComplexityColor(chatResponse._routing?.complexity)}`} />
                                                            <span className="text-slate-300 font-bold">{chatResponse._routing?.complexity}/10</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </form>
                </div>
            </section>

            {/* KPI Cards */}
            <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatCard
                    title="Total Requests"
                    value={stats.totalRequests}
                    icon={Activity}
                    trend="up"
                    trendValue="+12%"
                    color="blue"
                    sparklineData={[{ value: 10 }, { value: 45 }, { value: 30 }, { value: 60 }, { value: 75 }, { value: 90 }]}
                />
                <StatCard
                    title="Cost Savings"
                    value={stats.totalCost || 0}
                    prefix="$"
                    decimals={4}
                    icon={DollarSign}
                    trend="down"
                    trendValue="-4%"
                    color="emerald"
                    sparklineData={[{ value: 80 }, { value: 70 }, { value: 65 }, { value: 40 }, { value: 30 }, { value: 20 }]}
                />
                <StatCard
                    title="Energy Efficiency"
                    value={stats.totalEnergy || 0}
                    suffix=" kWh"
                    decimals={2}
                    icon={Leaf}
                    trend="up"
                    trendValue="+8%"
                    color="yellow"
                    sparklineData={[{ value: 30 }, { value: 50 }, { value: 45 }, { value: 60 }, { value: 80 }, { value: 95 }]}
                />
            </section>

            {/* Bottom Grid: Logs & Distribution */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Logs Table */}
                <div className="lg:col-span-2 glass-panel rounded-2xl p-6 min-h-[400px] flex flex-col relative overflow-hidden">
                    <div className="flex justify-between items-center mb-6 relative z-10">
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                            <Server size={18} className="text-slate-400" /> Recent Activity
                        </h2>
                        <button className="text-xs font-bold text-blue-400 hover:text-blue-300 transition-colors uppercase tracking-wider flex items-center gap-1 group">
                            View All <ArrowRight size={12} className="group-hover:translate-x-1 transition-transform" />
                        </button>
                    </div>

                    <div className="flex-1 overflow-auto rounded-xl border border-white/5 bg-slate-900/30 relative z-10 custom-scrollbar">
                        <table className="w-full text-left text-sm text-slate-400 border-collapse">
                            <thead className="bg-white/5 text-slate-200 uppercase text-xs font-bold sticky top-0 z-10 backdrop-blur-md">
                                <tr>
                                    <th className="p-4">Time</th>
                                    <th className="p-4">Complexity</th>
                                    <th className="p-4">Model</th>
                                    <th className="p-4 text-right">Cost</th>
                                    <th className="p-4 w-10"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                <AnimatePresence initial={false}>
                                    {logs.slice(0, 8).map((log, i) => (
                                        <React.Fragment key={log.id || i}>
                                            <motion.tr
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ delay: i * 0.05 }}
                                                onClick={() => toggleLogExpansion(log.id)}
                                                className="hover:bg-white/5 transition-colors cursor-pointer group"
                                            >
                                                <td className="p-4 font-mono text-xs text-slate-500 group-hover:text-slate-300 transition-colors">
                                                    {new Date(log.timestamp).toLocaleTimeString()}
                                                </td>
                                                <td className="p-4">
                                                    <div className="flex items-center gap-2">
                                                        <div className={`w-2 h-2 rounded-full ${getComplexityColor(log.complexity_score)} shadow-[0_0_8px_rgba(0,0,0,0.5)]`} />
                                                        <span className="font-medium text-slate-300">{log.complexity_score}</span>
                                                    </div>
                                                </td>
                                                <td className="p-4">
                                                    <span className="bg-slate-800 border border-slate-700 text-slate-300 px-2 py-1 rounded text-xs font-mono group-hover:bg-slate-700 transition-colors">
                                                        {log.model_selected}
                                                    </span>
                                                </td>
                                                <td className="p-4 text-right font-mono text-emerald-400">
                                                    ${log.cost.toFixed(5)}
                                                </td>
                                                <td className="p-4 text-slate-500">
                                                    {expandedLogId === log.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                                </td>
                                            </motion.tr>
                                            {/* Expanded Row */}
                                            <AnimatePresence>
                                                {expandedLogId === log.id && (
                                                    <motion.tr
                                                        initial={{ opacity: 0, height: 0 }}
                                                        animate={{ opacity: 1, height: 'auto' }}
                                                        exit={{ opacity: 0, height: 0 }}
                                                        className="bg-white/[0.02]"
                                                    >
                                                        <td colSpan={5} className="p-4 border-b border-white/5">
                                                            <div className="grid grid-cols-3 gap-4 text-xs">
                                                                <div className="space-y-1">
                                                                    <span className="text-slate-500 block uppercase tracking-wider">Tokens</span>
                                                                    <div className="flex gap-4">
                                                                        <span className="text-slate-300">In: <b className="text-white">{log.input_tokens}</b></span>
                                                                        <span className="text-slate-300">Out: <b className="text-white">{log.output_tokens}</b></span>
                                                                    </div>
                                                                </div>
                                                                <div className="space-y-1">
                                                                    <span className="text-slate-500 block uppercase tracking-wider">Performance</span>
                                                                    <div className="flex gap-4">
                                                                        <span className="text-slate-300">Latency: <b className="text-blue-400">120ms</b></span>
                                                                        <span className="text-slate-300">Cache: <b className="text-rose-400">MISS</b></span>
                                                                    </div>
                                                                </div>
                                                                <div className="space-y-1 text-right">
                                                                    <span className="text-slate-500 block uppercase tracking-wider">Routing</span>
                                                                    <span className="bg-white/10 px-2 py-0.5 rounded text-slate-300">Cost Optimized</span>
                                                                </div>
                                                            </div>
                                                        </td>
                                                    </motion.tr>
                                                )}
                                            </AnimatePresence>
                                        </React.Fragment>
                                    ))}
                                </AnimatePresence>
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Right Column: Active Providers & Distribution */}
                <div className="space-y-6">
                    {/* Model Distribution */}
                    <div className="glass-panel rounded-2xl p-6">
                        <h2 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                            <Cpu size={18} className="text-slate-400" /> Distribution
                        </h2>
                        <div className="h-48 relative">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={pieData}
                                        innerRadius={65}
                                        outerRadius={85}
                                        paddingAngle={4}
                                        dataKey="value"
                                        stroke="none"
                                        animationBegin={0}
                                        animationDuration={1500}
                                    >
                                        {pieData.map((entry, index) => (
                                            <Cell
                                                key={`cell-${index}`}
                                                fill={COLORS[index % COLORS.length]}
                                                className="hover:opacity-80 transition-opacity cursor-pointer stroke-slate-900 stroke-2"
                                            />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        content={({ active, payload }) => {
                                            if (active && payload && payload.length) {
                                                const data = payload[0].payload;
                                                return (
                                                    <div className="bg-slate-900 border border-slate-700 p-3 rounded-lg shadow-xl">
                                                        <p className="text-white font-bold mb-1">{data.name}</p>
                                                        <p className="text-emerald-400 font-mono text-xs">Cost: $0.0042/1k</p>
                                                        <p className="text-blue-400 font-mono text-xs">Lat: 145ms</p>
                                                    </div>
                                                );
                                            }
                                            return null;
                                        }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                            {/* Center Text */}
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <motion.div
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    transition={{ delay: 0.5, type: "spring" }}
                                    className="text-center"
                                >
                                    <span className="block text-3xl font-black text-white">{modelStats.reduce((a, b) => a + b.count, 0)}</span>
                                    <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Total</span>
                                </motion.div>
                            </div>
                        </div>
                        <div className="flex flex-wrap justify-center gap-2 mt-6">
                            {pieData.map((entry, index) => (
                                <div key={entry.name} className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-white/5 bg-white/5 hover:bg-white/10 transition-colors cursor-default">
                                    <div className="w-2 h-2 rounded-full shadow-[0_0_8px_currentColor]" style={{ backgroundColor: COLORS[index % COLORS.length], color: COLORS[index % COLORS.length] }} />
                                    <span className="text-xs font-medium text-slate-400">{entry.name}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Active Providers Status */}
                    <div className="glass-panel rounded-2xl p-6">
                        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                            <Network size={18} className="text-slate-400" /> Network Status
                        </h2>
                        <div className="space-y-2">
                            {['OpenAI', 'Anthropic', 'Gemini'].map((provider, i) => (
                                <div key={provider} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors group">
                                    <div className="flex items-center gap-3">
                                        <div className="relative">
                                            <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                            <div className="absolute inset-0 w-2 h-2 rounded-full bg-emerald-500 animate-ping opacity-75" />
                                        </div>
                                        <span className="font-medium text-slate-200">{provider}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="h-1 w-12 bg-slate-800 rounded-full overflow-hidden">
                                            <motion.div
                                                className="h-full bg-emerald-500"
                                                initial={{ width: "0%" }}
                                                animate={{ width: "95%" }}
                                                transition={{ delay: i * 0.2, duration: 1 }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
