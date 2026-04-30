import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, X } from 'lucide-react';
import { createPoll, MAX_POLL_OPTIONS, MIN_POLL_OPTIONS } from '../services/polls';
import styles from './CreatePollModal.module.css';

interface Props {
    open: boolean;
    onClose: () => void;
    tripId: string;
    tripMemberUids: string[];
    creatorUid: string;
    creatorName: string;
    creatorAvatarUrl?: string;
}

const QUICK_TEMPLATES = [
    { question: 'Where should we eat tonight?', options: ['Pizza', 'Sushi', 'Burgers', 'Local cuisine'] },
    { question: 'Bar after dinner?', options: ['Yes — let\'s go', 'Heading home', 'Decide later'] },
    { question: 'Activity tomorrow?', options: ['Beach', 'Sightseeing', 'Chill at hotel', 'Bar crawl'] },
    { question: 'What time do we leave?', options: ['Now', '30 min', '1 hour', '2 hours'] },
];

export const CreatePollModal: React.FC<Props> = ({
    open,
    onClose,
    tripId,
    tripMemberUids,
    creatorUid,
    creatorName,
    creatorAvatarUrl,
}) => {
    const [question, setQuestion] = useState('');
    const [options, setOptions] = useState<string[]>(['', '']);
    const [allowMultipleChoice, setAllowMultipleChoice] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    if (!open) return null;

    const reset = () => {
        setQuestion('');
        setOptions(['', '']);
        setAllowMultipleChoice(false);
        setError('');
    };

    const applyTemplate = (idx: number) => {
        const t = QUICK_TEMPLATES[idx];
        setQuestion(t.question);
        setOptions([...t.options]);
    };

    const addOption = () => {
        if (options.length < MAX_POLL_OPTIONS) setOptions([...options, '']);
    };

    const removeOption = (i: number) => {
        if (options.length > MIN_POLL_OPTIONS) setOptions(options.filter((_, idx) => idx !== i));
    };

    const updateOption = (i: number, value: string) => {
        setOptions(options.map((o, idx) => (idx === i ? value : o)));
    };

    const handleSubmit = async () => {
        setError('');
        if (!question.trim()) {
            setError('Add a question.');
            return;
        }
        const filled = options.map(o => o.trim()).filter(Boolean);
        if (filled.length < MIN_POLL_OPTIONS) {
            setError(`Add at least ${MIN_POLL_OPTIONS} options.`);
            return;
        }
        setSubmitting(true);
        try {
            await createPoll({
                tripId,
                question,
                options: filled,
                allowMultipleChoice,
                creatorUid,
                creatorName,
                creatorAvatarUrl,
                tripMemberUids,
            });
            reset();
            onClose();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to create poll');
        } finally {
            setSubmitting(false);
        }
    };

    return createPortal(
        <div className={styles.backdrop} onClick={onClose}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
                <div className={styles.header}>
                    <h2 className={styles.title}>New poll</h2>
                    <button onClick={onClose} className={styles.closeBtn} aria-label="Close">
                        <X size={20} />
                    </button>
                </div>

                <div className={styles.templates}>
                    {QUICK_TEMPLATES.map((t, i) => (
                        <button
                            key={i}
                            type="button"
                            className={styles.templateChip}
                            onClick={() => applyTemplate(i)}
                        >
                            {t.question}
                        </button>
                    ))}
                </div>

                <label className={styles.label}>Question</label>
                <input
                    className="input-field"
                    placeholder="What should we decide?"
                    value={question}
                    onChange={e => setQuestion(e.target.value)}
                    maxLength={140}
                />

                <label className={styles.label}>Options</label>
                <div className={styles.options}>
                    {options.map((opt, i) => (
                        <div key={i} className={styles.optionRow}>
                            <input
                                className="input-field"
                                placeholder={`Option ${i + 1}`}
                                value={opt}
                                onChange={e => updateOption(i, e.target.value)}
                                maxLength={80}
                            />
                            {options.length > MIN_POLL_OPTIONS && (
                                <button
                                    type="button"
                                    onClick={() => removeOption(i)}
                                    className={styles.removeBtn}
                                    aria-label={`Remove option ${i + 1}`}
                                >
                                    <X size={16} />
                                </button>
                            )}
                        </div>
                    ))}
                    {options.length < MAX_POLL_OPTIONS && (
                        <button type="button" onClick={addOption} className={styles.addBtn}>
                            <Plus size={16} /> Add option
                        </button>
                    )}
                </div>

                <label className={styles.checkboxRow}>
                    <input
                        type="checkbox"
                        checked={allowMultipleChoice}
                        onChange={e => setAllowMultipleChoice(e.target.checked)}
                    />
                    <span>Allow multiple choices per voter</span>
                </label>

                {error && <p className={styles.error}>{error}</p>}

                <div className={styles.actions}>
                    <button type="button" onClick={onClose} className="btn">
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleSubmit}
                        className="btn btn-primary"
                        disabled={submitting}
                    >
                        {submitting ? 'Posting…' : 'Post poll'}
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
};
