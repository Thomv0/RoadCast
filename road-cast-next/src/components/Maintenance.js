'use client';
import React, { useState, useEffect } from 'react';

import { SprayCan, Gauge, Fuel, Droplets, Motorbike, Wrench, Download, Upload, FileText, Paperclip } from 'lucide-react';

const getXmlText = (element, localName) =>
    element.getElementsByTagNameNS('*', localName)[0]?.textContent?.trim() || '';

const parseMaintenanceInvoice = (xmlText) => {
    const document = new DOMParser().parseFromString(xmlText, 'application/xml');
    if (document.getElementsByTagName('parsererror').length > 0 ||
        document.documentElement.localName !== 'Invoice') {
        throw new Error('The selected file is not a valid UBL invoice XML.');
    }

    const supplierParty = document.getElementsByTagNameNS('*', 'AccountingSupplierParty')[0];
    const supplierName = supplierParty ? getXmlText(supplierParty, 'Name') : '';
    const issueDate = getXmlText(document, 'IssueDate');
    const invoiceNumber = getXmlText(document, 'ID');
    const amount = getXmlText(document, 'PayableAmount');
    const descriptions = Array.from(document.getElementsByTagNameNS('*', 'InvoiceLine'))
        .map((line) => getXmlText(line, 'Description') || getXmlText(line, 'Name'))
        .filter(Boolean);

    return {
        date: /^\d{4}-\d{2}-\d{2}$/.test(issueDate) ? issueDate : '',
        supplier: supplierName,
        invoiceNumber,
        amount: amount && Number.isFinite(Number(amount)) ? amount : '',
        description: [...new Set(descriptions)].join('\n')
    };
};

const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
        if (typeof reader.result === 'string') {
            resolve(reader.result);
        } else {
            reject(new Error('The selected PDF could not be read.'));
        }
    };
    reader.onerror = () => reject(new Error('The selected PDF could not be read.'));
    reader.readAsDataURL(file);
});

export default function Maintenance() {
    const [entries, setEntries] = useState([]);

    const [taskType, setTaskType] = useState('chain');
    const [km, setKm] = useState('');
    const [liters, setLiters] = useState('');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [description, setDescription] = useState('');
    const [supplier, setSupplier] = useState('');
    const [invoiceNumber, setInvoiceNumber] = useState('');
    const [amount, setAmount] = useState('');
    const [pdfFile, setPdfFile] = useState(null);
    const [formMessage, setFormMessage] = useState('');

    useEffect(() => {
        const saved = localStorage.getItem('maintenanceEntries');
        if (saved) {
            const parsedEntries = JSON.parse(saved);
            setEntries(parsedEntries);
            if (parsedEntries.length > 0) {
                setKm(parsedEntries[0].km.toString());
            }
        }
    }, []);

    const taskTypes = {
        chain: { label: 'Chain Lubing', icon: SprayCan },
        tires: { label: 'Tire Pressure', icon: Gauge },
        fuel: { label: 'Refueling', icon: Fuel },
        clean: { label: 'Cleaning', icon: Droplets },
        general: { label: 'General', icon: Wrench }
    };
    const lastOdometer = entries.find((entry) => entry.km != null);

    const importInvoiceXml = (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;

        const reader = new FileReader();
        reader.onload = () => {
            try {
                if (typeof reader.result !== 'string') {
                    throw new Error('The selected XML file could not be read.');
                }
                const invoice = parseMaintenanceInvoice(reader.result);
                setTaskType('general');
                setDate(invoice.date || new Date().toISOString().split('T')[0]);
                setSupplier(invoice.supplier);
                setInvoiceNumber(invoice.invoiceNumber);
                setAmount(invoice.amount);
                setDescription(invoice.description);
                setFormMessage('Invoice details loaded. Review them, add the odometer if known, and attach the PDF before saving.');
            } catch (error) {
                setFormMessage(error instanceof Error ? error.message : 'The invoice XML could not be read.');
            }
        };
        reader.onerror = () => setFormMessage('The selected XML file could not be read.');
        reader.readAsText(file);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setFormMessage('');

        const newEntry = {
            id: Date.now(),
            type: taskType,
            km: km.trim() ? parseFloat(km) : null,
            liters: taskType === 'fuel' ? parseFloat(liters) : null,
            date: date,
            description: taskType === 'general' ? description : null,
            supplier: taskType === 'general' ? supplier : null,
            invoiceNumber: taskType === 'general' ? invoiceNumber : null,
            amount: taskType === 'general' && amount.trim() ? parseFloat(amount) : null
        };

        try {
            if (pdfFile) {
                const signature = await pdfFile.slice(0, 5).text();
                if (signature !== '%PDF-') {
                    setFormMessage('The selected attachment is not a valid PDF file.');
                    return;
                }
                newEntry.attachment = {
                    name: pdfFile.name,
                    dataUrl: await readFileAsDataUrl(pdfFile)
                };
            }

            const updatedEntries = [newEntry, ...entries].sort((a, b) =>
                new Date(b.date) - new Date(a.date)
            );
            localStorage.setItem('maintenanceEntries', JSON.stringify(updatedEntries));
            setEntries(updatedEntries);
            setPdfFile(null);
            setDescription('');
            setSupplier('');
            setInvoiceNumber('');
            setAmount('');
            setFormMessage('Maintenance entry saved.');
        } catch (error) {
            setFormMessage(error instanceof Error
                ? `${error.message} The entry was not saved.`
                : 'The entry could not be saved. Check available browser storage and try again.');
            return;
        }

        // Keep the KM value for next entry (user can adjust if needed)
        setLiters('');
        setDate(new Date().toISOString().split('T')[0]);
    };

    const deleteEntry = (id) => {
        const updatedEntries = entries.filter(entry => entry.id !== id);
        try {
            localStorage.setItem('maintenanceEntries', JSON.stringify(updatedEntries));
            setEntries(updatedEntries);
        } catch (error) {
            setFormMessage(error instanceof Error ? error.message : 'The entry could not be deleted.');
        }
    };

    const formatDate = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('nl-NL', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    };

    const exportData = () => {
        const dataStr = JSON.stringify(entries, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `maintenance-data-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const importData = (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const importedData = JSON.parse(e.target.result);
                if (Array.isArray(importedData)) {
                    setEntries(importedData);
                    localStorage.setItem('maintenanceEntries', JSON.stringify(importedData));
                    alert(`Successfully imported ${importedData.length} entries!`);
                } else {
                    alert('Invalid file format. Please select a valid maintenance data file.');
                }
            } catch (error) {
                alert('Error reading file. Please select a valid JSON file.');
                console.error('Import error:', error);
            }
        };
        reader.readAsText(file);
    };

    return (
        <div className="maintenance-container">
            <h1 className="maintenance-title">
                Motorcycle Maintenance
                <Motorbike size={32} strokeWidth={2} style={{ display: 'inline-block', marginRight: '10px', verticalAlign: 'middle' }} />
            </h1>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginBottom: '20px' }}>
                <button
                    type="button"
                    onClick={exportData}
                    className="btn-add"
                    style={{ width: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}
                    disabled={entries.length === 0}
                >
                    <Download size={20} />
                    Export Data
                </button>
                <label
                    className="btn-add"
                    style={{ width: 'auto', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', margin: 0 }}
                >
                    <Upload size={20} />
                    Import Data
                    <input
                        type="file"
                        accept=".json"
                        onChange={importData}
                        style={{ display: 'none' }}
                    />
                </label>
            </div>

            <div className="maintenance-import">
                <label className="btn-add">
                    <FileText size={20} />
                    Import invoice XML
                    <input
                        type="file"
                        accept=".xml,text/xml,application/xml"
                        onChange={importInvoiceXml}
                        style={{ display: 'none' }}
                    />
                </label>
                <p>Load the date, supplier, invoice number, amount, and maintenance details from a UBL invoice.</p>
            </div>

            <form className="maintenance-form" onSubmit={handleSubmit}>
                <div className="form-group">
                    <label>Task</label>
                    <select
                        value={taskType}
                        onChange={(e) => setTaskType(e.target.value)}
                        className="form-select"
                    >
                        {Object.entries(taskTypes).map(([key, { label }]) => (
                            <option key={key} value={key}>{label}</option>
                        ))}
                    </select>
                </div>

                <div className="form-group">
                    <label>Date</label>
                    <input
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        required
                        className="form-input"
                    />
                </div>

                <div className="form-group">
                    <label>Odometer (km)</label>
                    <input
                        type="number"
                        value={km}
                        onChange={(e) => setKm(e.target.value)}
                        required={taskType !== 'general'}
                        className="form-input"
                        placeholder={lastOdometer ? `Last: ${lastOdometer.km} km` : 'Enter km'}
                    />
                </div>

                {taskType === 'fuel' && (
                    <div className="form-group">
                        <label>Liters</label>
                        <input
                            type="number"
                            step="0.01"
                            value={liters}
                            onChange={(e) => setLiters(e.target.value)}
                            className="form-input"
                            placeholder="Enter liters"
                        />
                    </div>
                )}

                {taskType === 'general' && (
                    <>
                        <div className="form-group">
                            <label>Description</label>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                className="form-input"
                                placeholder="Enter maintenance details"
                                rows={5}
                            />
                        </div>
                        <div className="form-group">
                            <label>Workshop / supplier</label>
                            <input
                                type="text"
                                value={supplier}
                                onChange={(e) => setSupplier(e.target.value)}
                                className="form-input"
                                placeholder="Optional"
                            />
                        </div>
                        <div className="form-group">
                            <label>Invoice number</label>
                            <input
                                type="text"
                                value={invoiceNumber}
                                onChange={(e) => setInvoiceNumber(e.target.value)}
                                className="form-input"
                                placeholder="Optional"
                            />
                        </div>
                        <div className="form-group">
                            <label>Amount (€)</label>
                            <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                className="form-input"
                                placeholder="Optional"
                            />
                        </div>
                        <div className="form-group">
                            <span className="pdf-picker-label">Invoice PDF</span>
                            <div className="pdf-file-picker">
                                <input
                                    id="maintenance-pdf"
                                    type="file"
                                    accept="application/pdf,.pdf"
                                    onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
                                    className="pdf-file-input"
                                />
                                <label className="pdf-file-button" htmlFor="maintenance-pdf">
                                    <Paperclip size={18} />
                                    Choose PDF
                                </label>
                                <span className="selected-file">
                                    {pdfFile ? pdfFile.name : 'No file selected'}
                                </span>
                            </div>
                        </div>
                    </>
                )}

                <button type="submit" className="btn-add">Add Entry</button>
                {formMessage && <p className="maintenance-message" role="status">{formMessage}</p>}
            </form>

            <div className="maintenance-history">
                <h2>History</h2>
                {entries.length === 0 ? (
                    <p className="no-entries">No maintenance entries yet</p>
                ) : (
                    <div className="entries-list">
                        {entries.map(entry => {
                            const task = taskTypes[entry.type] || taskTypes.general;
                            const IconComponent = task.icon;
                            return (
                                <div key={entry.id} className="entry-card">
                                    <div className="entry-header">
                                        <div className="entry-title">
                                            <IconComponent
                                                className="entry-icon"
                                                size={24}
                                                strokeWidth={2}
                                            />
                                            <span className="entry-type">{task.label}</span>
                                        </div>
                                        <button
                                            onClick={() => deleteEntry(entry.id)}
                                            className="btn-delete"
                                        >
                                            ×
                                        </button>
                                    </div>
                                    <div className="entry-details">
                                        <span className="entry-date">{formatDate(entry.date)}</span>
                                        {entry.km != null && <span className="entry-km">{entry.km} km</span>}
                                        {entry.liters && (
                                            <span className="entry-liters">{entry.liters} L</span>
                                        )}
                                        {entry.supplier && <span>{entry.supplier}</span>}
                                        {entry.invoiceNumber && <span>Invoice {entry.invoiceNumber}</span>}
                                        {entry.amount != null && (
                                            <span>{new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(entry.amount)}</span>
                                        )}
                                        {entry.description && (
                                            <span className="entry-description">{entry.description}</span>
                                        )}
                                        {entry.attachment?.dataUrl && (
                                            <a
                                                className="entry-attachment"
                                                href={entry.attachment.dataUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                            >
                                                <Paperclip size={16} />
                                                View {entry.attachment.name || 'attached PDF'}
                                            </a>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
