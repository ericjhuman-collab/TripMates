import React, { useState, useMemo } from 'react';
import { useEven } from '../context/useEven';
import { useTrip } from '../context/TripContext';
import { getCategoryById } from '../utils/categories';
import {
    Cell, ResponsiveContainer, Tooltip,
    BarChart, Bar, XAxis, YAxis, CartesianGrid,
    type TooltipContentProps
} from 'recharts';
import styles from './InsightsTab.module.css';

type GraphType = 'CATEGORIES' | 'PAYERS';

const CATEGORY_COLORS: Record<string, string> = {
    restaurant: '#FF9A7A', // Coral
    groceries: '#88D0C9', // Teal
    drinks: '#F7D060', // Yellow
    accommodation: '#A5C0DD', // Light Blue
    transportation: '#C39BD3', // Purple
    activities: '#FFBFA3', // Light Coral
    shopping: '#F3BCC8', // Pink
    other: '#D3D3D3' // Gray
};

export const InsightsTab: React.FC = () => {
    const { expenses, participants } = useEven();
    const { activeTrip } = useTrip();
    const [graphType, setGraphType] = useState<GraphType>('CATEGORIES');

    const currency = activeTrip?.baseCurrency || 'SEK';

    // 1. Prepare Categories Data
    const categoryData = useMemo(() => {
        const map = new Map<string, number>();
        expenses.forEach(e => {
            const cat = e.category || 'other';
            map.set(cat, (map.get(cat) || 0) + e.amount);
        });

        return Array.from(map.entries()).map(([rawId, amount]) => {
            let id = rawId;
            if (id === 'transportation') id = 'transport'; // Fix legacy id from older OCR / typo

            const catObj = getCategoryById(id) || { id: 'other', name: id.charAt(0).toUpperCase() + id.slice(1), icon: '❓' };
            return {
                id,
                name: catObj.name,
                icon: catObj.icon,
                amount: Math.round(amount / 100),
                fill: CATEGORY_COLORS[id] || CATEGORY_COLORS.other
            };
        }).sort((a, b) => b.amount - a.amount);
    }, [expenses]);

    // 2. Prepare Payers Data
    const payersData = useMemo(() => {
        const map = new Map<string, number>();
        expenses.forEach(e => {
            map.set(e.payerId, (map.get(e.payerId) || 0) + e.amount);
        });

        return Array.from(map.entries()).map(([uid, amount]) => {
            const p = participants.find(p => p.uid === uid);
            return {
                name: p?.shortName || p?.name || 'Unknown',
                amount: Math.round(amount / 100),
                fill: p?.color || '#888' // Default avatar colors!
            };
        }).sort((a, b) => b.amount - a.amount);
    }, [expenses, participants]);

    // Custom Tooltip for PieChart
    const renderCustomTooltip = ({ active, payload }: TooltipContentProps) => {
        if (active && payload && payload.length) {
            const data = payload[0].payload;
            return (
                <div className={styles.customTooltip}>
                    <p className={styles.label}>{`${data.icon} ${data.name}`}</p>
                    <p className={styles.intro}>{`${data.amount.toLocaleString()} ${currency}`}</p>
                </div>
            );
        }
        return null;
    };

    // Custom bar label for the Top Payers chart. Always renders the payer
    // name vertically (bottom→top); the only thing that changes when a bar is
    // too short is where the vertical text sits — inside the colored bar when
    // there's room, anchored just above the bar otherwise.
    const renderPayerLabel = (props: {
        x?: string | number; y?: string | number;
        width?: string | number; height?: string | number;
        index?: number;
    }) => {
        const x = typeof props.x === 'number' ? props.x : Number(props.x) || 0;
        const y = typeof props.y === 'number' ? props.y : Number(props.y) || 0;
        const width = typeof props.width === 'number' ? props.width : Number(props.width) || 0;
        const height = typeof props.height === 'number' ? props.height : Number(props.height) || 0;
        const index = props.index ?? 0;
        const name = payersData[index]?.name || '';
        if (!name) return <></>;

        // Approx height the rotated text needs (per-char + a little padding).
        const verticalNeeded = name.length * 9 + 12;
        const fitsInside = height >= verticalNeeded;
        const cx = x + width / 2;

        if (fitsInside) {
            // Anchored near the bar's base; rotated -90 so it reads bottom→up
            // and fills the colored area.
            const baseY = y + height - 8;
            return (
                <text
                    x={cx}
                    y={baseY}
                    fill="#ffffff"
                    fontSize={13}
                    fontWeight={700}
                    textAnchor="start"
                    transform={`rotate(-90, ${cx}, ${baseY})`}
                    style={{ paintOrder: 'stroke', stroke: 'rgba(0,0,0,0.18)', strokeWidth: 2 }}
                >
                    {name}
                </text>
            );
        }

        // Anchored just above the bar's top edge; rotated -90 so the text
        // climbs upward into the chart's top margin.
        const baseY = y - 6;
        return (
            <text
                x={cx}
                y={baseY}
                fill="#1f2937"
                fontSize={12}
                fontWeight={600}
                textAnchor="start"
                transform={`rotate(-90, ${cx}, ${baseY})`}
            >
                {name}
            </text>
        );
    };

    // Custom Tooltip for BarChart
    const renderBarTooltip = ({ active, payload }: TooltipContentProps) => {
        if (active && payload && payload.length) {
            const data = payload[0].payload;
            return (
                <div className={styles.customTooltip}>
                    <p className={styles.label}>{`${data.name} paid`}</p>
                    <p className={styles.intro}>{`${data.amount.toLocaleString()} ${currency}`}</p>
                </div>
            );
        }
        return null;
    };

    return (
        <div className={styles.container}>
            <div className={styles.segmentedControl}>
                <button 
                    className={`${styles.segmentBtn} ${graphType === 'CATEGORIES' ? styles.activeSegment : ''}`}
                    onClick={() => setGraphType('CATEGORIES')}
                >
                    Spending by Category
                </button>
                <button 
                    className={`${styles.segmentBtn} ${graphType === 'PAYERS' ? styles.activeSegment : ''}`}
                    onClick={() => setGraphType('PAYERS')}
                >
                    Top Payers
                </button>
            </div>

            <div className={styles.graphCard}>
                <h3 className={styles.graphTitle}>
                    {graphType === 'CATEGORIES' ? 'Expenses by Category' : 'Who Paid the Most?'}
                </h3>
                
                <div className={styles.chartWrapper}>
                    {graphType === 'CATEGORIES' && categoryData.length > 0 && (
                        <ResponsiveContainer width="100%" height={250} minHeight={250}>
                            <BarChart
                                data={categoryData}
                                margin={{ top: 20, right: 10, left: 0, bottom: 20 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                <XAxis 
                                    dataKey="icon" 
                                    axisLine={false} 
                                    tickLine={false}
                                    tick={{ fontSize: 20 }}
                                />
                                <YAxis hide />
                                <Tooltip content={renderCustomTooltip} cursor={{fill: '#F7FAFC'}} />
                                <Bar dataKey="amount" radius={[4, 4, 0, 0]} barSize={40}>
                                    {categoryData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.fill} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    )}

                    {graphType === 'PAYERS' && payersData.length > 0 && (
                        <ResponsiveContainer width="100%" height={260} minHeight={260}>
                            <BarChart
                                data={payersData}
                                margin={{ top: 60, right: 10, left: 0, bottom: 8 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                <XAxis
                                    dataKey="name"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={false}
                                    height={0}
                                />
                                <YAxis hide />
                                <Tooltip content={renderBarTooltip} cursor={{fill: '#F7FAFC'}} />
                                <Bar dataKey="amount" radius={[4, 4, 0, 0]} barSize={40} label={renderPayerLabel}>
                                    {payersData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.fill} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    )}

                    {/* Empty states */}
                    {graphType === 'CATEGORIES' && categoryData.length === 0 && (
                        <div className={styles.emptyState}>No tracked expenses yet</div>
                    )}
                    {graphType === 'PAYERS' && payersData.length === 0 && (
                        <div className={styles.emptyState}>No tracked expenses yet</div>
                    )}
                </div>

                {/* Legend for Pie Chart */}
                {graphType === 'CATEGORIES' && categoryData.length > 0 && (
                    <div className={styles.legendContainer}>
                        {categoryData.map(c => (
                            <div key={c.id} className={styles.legendItem}>
                                <div className={styles.legendColor} style={Object.assign({}, { backgroundColor: c.fill })}></div>
                                <span className={styles.legendIcon}>{c.icon}</span>
                                <span className={styles.legendText}>{c.name}</span>
                                <span className={styles.legendValue}>{c.amount.toLocaleString()}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
