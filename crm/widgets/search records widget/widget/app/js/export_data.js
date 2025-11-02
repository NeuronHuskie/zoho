// █▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀█
// █                INITIALIZATION & UI MANAGEMENT                        █
// █▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄█

var exportDropdownOpen = false;

// ════════════════════════════════════════════════════════════════════════════════════════════════════════

// Toggles the visibility of the export options dropdown menu
function toggleExportDropdown() {
    const dropdown = document.getElementById('exportDropdown');
    exportDropdownOpen = !exportDropdownOpen;
    dropdown.classList.toggle('show', exportDropdownOpen);
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════════

// Closes the export dropdown menu if a click occurs outside of its container
document.addEventListener('click', function(event) {
    const container = document.querySelector('.export-container');
    if (!container.contains(event.target)) {
        document.getElementById('exportDropdown').classList.remove('show');
        exportDropdownOpen = false;
    }
});

// █▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀█
// █                DATA & EXPORT ORCHESTRATION                           █
// █▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄█

// Extracts the currently visible data from the HTML table for exporting
function getCurrentTableData() {
    const visibleRows = document.querySelectorAll('#tbody tr');
    const data = [];
       
    visibleRows.forEach(row => {
        const rowData = {};
        const cells = row.querySelectorAll('td');
        
        const dataStartIndex = 2; // Skip the first two columns (checkbox and row number) to get to the actual data
        
        config.fields.forEach((field, fieldIndex) => { // Map each configured field to its corresponding table cell
            const cellIndex = dataStartIndex + fieldIndex;
                        
            if (cellIndex < cells.length) {
                const cell = cells[cellIndex];
                const link = cell.querySelector('a[href]');

                if (link && link.href && link.href.startsWith('http')) { // If the cell contains a link, extract both text and URL
                    rowData[field.label] = (link.textContent || link.innerText).trim();
                    rowData[field.label + '.url'] = link.href;
                } else { // Otherwise, just get the text content
                    rowData[field.label] = (cell.textContent || cell.innerText).trim();
                }
            } else {
                rowData[field.label] = ''; // Assign empty string for missing cells
            }
        });
        
        data.push(rowData);
    });
        
    return data;
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════════

function exportData(format) {
    const data = getCurrentTableData();
    
    if (!data || data.length === 0) {
        alert('No data to export');
        return;
    }

    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:\-T]/g, '');
    const filename = `zoho_records_${timestamp}`;

    switch (format) {
        case 'csv':
            exportToCSV(data, filename);
            break;
        case 'xlsx':
            exportToXLSX(data, filename);
            break;
        case 'pdf':
            exportToPDF(data, filename);
            break;
        case 'json':
            exportToJSON(data, filename);
            break;
    }

    // Close the dropdown after exporting
    document.getElementById('exportDropdown').classList.remove('show');
    exportDropdownOpen = false;
}

// █▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀█
// █                FORMAT-SPECIFIC EXPORT FUNCTIONS                      █
// █▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄█

function exportToCSV(data, filename) {
    if (!data.length) return;
    
    const headers = Object.keys(data[0]);
    const csvContent = [
        headers.join(','),
        ...data.map(row => 
            headers.map(header => {
                const value = String(row[header] || '');
                if (value.includes(',') || value.includes('"') || value.includes('\n')) { // Escape quotes and wrap in quotes if value contains comma, quote, or newline
                    return '"' + value.replace(/"/g, '""') + '"';
                }
                return value;
            }).join(',')
        )
    ].join('\n');

    downloadFile(csvContent, `${filename}.csv`, 'text/csv;charset=utf-8;');
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════════

function exportToXLSX(data, filename) {
    if (typeof XLSX === 'undefined') {
        alert('Excel export library (SheetJS) not loaded.');
        return;
    }

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Records');
    
    // Auto-size columns for better readability
    const range = XLSX.utils.decode_range(ws['!ref']);
    const colWidths = [];
    for (let C = range.s.c; C <= range.e.c; ++C) {
        let maxWidth = 10;
        for (let R = range.s.r; R <= range.e.r; ++R) {
            const cell = ws[XLSX.utils.encode_cell({r: R, c: C})];
            if (cell && cell.v) {
                const cellLength = cell.v.toString().length;
                if (cellLength > maxWidth) {
                    maxWidth = Math.min(cellLength, 50); // Cap width at 50 characters
                }
            }
        }
        colWidths.push({wch: maxWidth});
    }
    ws['!cols'] = colWidths;

    XLSX.writeFile(wb, `${filename}.xlsx`);
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════════

function exportToPDF(data, filename) {
    try {
        let jsPDFConstructor = null;
        
        if (typeof window.jsPDF !== 'undefined') {
            jsPDFConstructor = window.jsPDF;
        } else if (typeof jsPDF !== 'undefined') {
            jsPDFConstructor = jsPDF;
        } else if (window.jspdf && typeof window.jspdf.jsPDF !== 'undefined') {
            jsPDFConstructor = window.jspdf.jsPDF;
        } else {
            alert('PDF export library not loaded properly. Please refresh the page and try again.');
            return;
        }

        const doc = new jsPDFConstructor({
            orientation: 'landscape',
            unit: 'mm',
            format: 'a4'
        });
        
        if (typeof doc.autoTable !== 'function') {
            alert('PDF table plugin not loaded. Please refresh the page and try again.');
            return;
        }
        
        doc.setFontSize(14);
        doc.text('Zoho CRM Records Export', 14, 15);
        
        doc.setFontSize(8);
        doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 22);
        
        if (!data.length) {
            doc.setFontSize(10);
            doc.text('No data to export', 14, 35);
        } else {
            const allKeys = Object.keys(data[0]);
            const headers = allKeys.filter(key => !key.endsWith('.url'));
            const processedRows = data.map(row => 
                headers.map(header => {
                    const value = String(row[header] || '');
                    const url = row[header + '.url'];
                    const truncatedValue = value.length > 50 ? value.substring(0, 47) + '...' : value;
                    return url ? { text: truncatedValue, url: url } : truncatedValue;
                })
            );
            
            doc.autoTable({
                head: [headers],
                body: processedRows,
                startY: 30,
                theme: 'grid',
                styles: { fontSize: 7, cellPadding: 1.5, overflow: 'linebreak' },
                headStyles: { fillColor: [2, 84, 93], textColor: 255, fontStyle: 'bold', fontSize: 8 },
                alternateRowStyles: { fillColor: [239, 239, 239] },
                margin: { top: 30, left: 10, right: 10, bottom: 20 },
                didParseCell: function(data) {
                    if (data.cell.raw?.url) {
                        data.cell.text = data.cell.raw.text;
                        data.cell.styles.textColor = [17, 85, 204];
                    }
                },
                didDrawCell: function(data) {
                    if (data.cell.raw?.url) {
                        doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url: data.cell.raw.url });
                    }
                },
                didDrawPage: function (data) {
                    const pageCount = doc.internal.getNumberOfPages();
                    doc.setFontSize(8);
                    doc.text(`Page ${data.pageNumber} of ${pageCount}`, doc.internal.pageSize.width - 30, doc.internal.pageSize.height - 10);
                }
            });
        }

        doc.save(`${filename}.pdf`);
    } catch (error) {
        console.error('PDF generation error:', error);
        alert('An error occurred while generating the PDF: ' + error.message);
    }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════════

function exportToJSON(data, filename) {
    const jsonContent = JSON.stringify(data, null, 2); // Pretty-print with 2 spaces
    downloadFile(jsonContent, `${filename}.json`, 'application/json');
}

// █▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀█
// █                         UTILITY FUNCTIONS                            █
// █▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄█

function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}