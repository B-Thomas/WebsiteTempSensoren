(() => {
  "use strict";
  const cfg = window.SENSOR_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const fmt = (value, digits = 1) => Number.isFinite(Number(value)) ? Number(value).toLocaleString("en-US", {minimumFractionDigits: digits, maximumFractionDigits: digits}) : "—";
  const escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const now = () => new Date();
  const isoLocal = (date) => {
    const d = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return d.toISOString().slice(0, 19).replace("T", " ");
  };
  const dateInput = (date) => {
    const d = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return d.toISOString().slice(0, 10);
  };
  const showError = (id, message) => {
    const el = $(id);
    if (!el) return;
    el.textContent = message;
    el.classList.remove("hidden");
  };
  const clearError = (id) => { const el = $(id); if (el) el.classList.add("hidden"); };

  async function postData(payload) {
    if (!cfg.dataUrl || !cfg.secret || !cfg.key || String(cfg.secret).includes("YOUR_") || String(cfg.key).includes("YOUR_")) {
      throw new Error("Create config.js and set the API secret and API key.");
    }
    const response = await fetch(cfg.dataUrl, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({...payload, secret: cfg.secret, key: cfg.key})
    });
    if (!response.ok) throw new Error(`The data API responded with HTTP ${response.status}.`);
    const raw = await response.text();
    let json;
    try { json = JSON.parse(raw); } catch { throw new Error("The data API did not return valid JSON. Check the secret, the PHP error log, and the API response."); }
    if (json.error || (json.SmarthomeResponses && !Array.isArray(json.SmarthomeResponses) && json.SmarthomeResponses.error)) {
      throw new Error(json.error || json.SmarthomeResponses.error);
    }
    if (typeof json === "string" || raw.includes("Invalid Secret Key")) throw new Error("The PHP endpoint rejected the API secret.");
    return json.SmarthomeResponses ?? json;
  }

  async function getRooms() {
    if (!cfg.roomsUrl) throw new Error("roomsUrl is missing in config.js.");
    const response = await fetch(cfg.roomsUrl, {cache:"no-store"});
    if (!response.ok) throw new Error(`The room list could not be loaded (HTTP ${response.status}).`);
    const json = await response.json();
    if (!json.success || !Array.isArray(json.rooms)) throw new Error(json.error || "The room-list API returned an invalid response.");
    return json.rooms;
  }

  function normalizeRow(row) {
    return {
      time: row.timestamp ?? row.DateGroup ?? row.YearWeekStart ?? row.YearMonthStart ?? "",
      temp: row.temperature ?? row.temperature_avg ?? row.AvgTemp,
      humidity: row.humidity ?? row.humidity_avg ?? row.AvgHum,
      minTemp: row.MinTemp ?? row.min_temperature,
      maxTemp: row.MaxTemp ?? row.max_temperature,
      minHumidity: row.MinHum ?? row.min_humidity,
      maxHumidity: row.MaxHum ?? row.max_humidity
    };
  }

  async function readRoom(roomId, start, end, granularity = "raw") {
    const result = await postData({
      access: "READ",
      query: "visualization",
      params: {source: String(roomId), start_date: start, end_date: end, granularity}
    });
    if (!Array.isArray(result)) throw new Error("The data API did not return a list of readings.");
    return result.map(normalizeRow).reverse();
  }

  function makeChart(canvas, labels, datasets, options = {}) {
    return new Chart(canvas, {
      type: "line",
      data: {labels, datasets: datasets.map(ds => ({
        label: ds.label, data: ds.data, borderColor: ds.color, backgroundColor: ds.color,
        borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: .25, spanGaps: true
      }))},
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        interaction: {mode:"index", intersect:false},
        plugins: {legend: {display: true, position:"bottom", labels:{usePointStyle:true, boxWidth:7, padding:18}}, tooltip:{padding:10}},
        scales: {
          x: {grid:{display:false}, ticks:{maxTicksLimit:7, maxRotation:0, color:"#8994a6", font:{size:10}}},
          y: {grid:{color:"#edf0f5"}, ticks:{color:"#8994a6", font:{size:10}}}
        },
        ...options
      }
    });
  }

  function timeLabel(value, granularity) {
    if (!value) return "—";
    const s = String(value);
    if (granularity === "month") return s.slice(0, 7);
    if (s.length >= 16) return s.slice(5, 16);
    return s.slice(0, 10);
  }

  async function initOverview() {
    const grid = $("room-grid");
    const refreshBtn = $("refresh-button");
    let charts = [];
    let busy = false;
    async function load() {
      if (busy) return;
      busy = true;
      refreshBtn.disabled = true;
      clearError("global-error");
      try {
        const rooms = await getRooms();
        if (!rooms.length) {
          grid.innerHTML = '<div class="loading-card">No rooms found.</div>';
          return;
        }
        const end = now();
        const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
        const results = await Promise.all(rooms.map(async room => {
          try {
            let temprow = await readRoom(room.id, isoLocal(start), isoLocal(end), "raw");
            const rows = temprow.reverse();
            return {room, rows};
          } catch (error) { return {room, error}; }
        }));
        charts.forEach(c => c.destroy());
        charts = [];
        grid.innerHTML = "";
        results.forEach(({room, rows, error}, index) => {
          const card = document.createElement("article");
          card.className = "room-card";
          card.innerHTML = `
            <div class="room-card-top"><div><h2>${escapeHtml(room.name)}</h2><p class="muted">Last 24 hours</p></div><a class="room-link" href="room.html?id=${encodeURIComponent(room.id)}&name=${encodeURIComponent(room.name)}">View details ↗</a></div>
            <div class="metrics-inline"><div class="mini-metric"><span>Current temperature</span><strong id="temp-${index}">— <small>°C</small></strong></div><div class="mini-metric"><span>Current humidity</span><strong id="hum-${index}">— <small>%</small></strong></div></div>
            ${error ? `<div class="notice notice-error">${escapeHtml(error.message)}</div>` : `<div class="chart-wrap"><canvas id="chart-${index}" aria-label="Temperature and humidity ${escapeHtml(room.name)}"></canvas></div><div class="chart-legend-note"><span>Separate scale per measurement</span><span>·</span><span>${rows.length} readings</span></div>`}`;
          grid.appendChild(card);
          if (error || !rows.length) {
            if (!error) card.querySelector(".chart-legend-note").textContent = "No readings in the last 24 hours.";
            return;
          }
          const latest = rows[rows.length - 1];
          $(`temp-${index}`).innerHTML = `${fmt(latest.temp)} <small>°C</small>`;
          $(`hum-${index}`).innerHTML = `${fmt(latest.humidity, 0)} <small>%</small>`;
          // Two independent y-axes keep °C and % readable in the same chart.
          charts.push(makeChart($(`chart-${index}`), rows.map(r => timeLabel(r.time, "raw")), [
            {label:"Temperature (°C)", data:rows.map(r => r.temp), color:"#3978f6"},
            {label:"Humidity (%)", data:rows.map(r => r.humidity), color:"#12a594"}
          ], {scales:{
            x:{grid:{display:false},ticks:{maxTicksLimit:6,maxRotation:0,color:"#8994a6",font:{size:10}}},
            y:{position:"left",grid:{color:"#edf0f5"},ticks:{color:"#3978f6",font:{size:10}}},
            y1:{position:"right",grid:{drawOnChartArea:false},ticks:{color:"#12a594",font:{size:10}},min:0,max:100}
          }, datasets: undefined}));
          // Bind humidity to right axis (Chart.js dataset option).
          const chart = charts[charts.length - 1];
          chart.data.datasets[1].yAxisID = "y1";
          chart.update("none");
        });
        $("last-updated").textContent = `Updated ${now().toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"})}`;
      } catch (error) {
        showError("global-error", error.message);
        grid.innerHTML = '<div class="loading-card">Data could not be loaded. Details are shown above.</div>';
      } finally {
        busy = false;
        refreshBtn.disabled = false;
      }
    }
    refreshBtn.addEventListener("click", load);
    await load();
    window.setInterval(load, Math.max(15000, Number(cfg.refreshMs) || 60000));
  }

  async function initRoom() {
    const params = new URLSearchParams(location.search);
    const roomId = params.get("id");
    const roomName = params.get("name") || "Room";
    $("room-title").textContent = roomName;
    if (!roomId) {
      showError("room-error", "No room id was provided. Open this page from the room overview.");
      return;
    }
    const endDefault = now();
    const startDefault = new Date(endDefault);
    startDefault.setDate(startDefault.getDate() - 30);
    $("start-date").value = dateInput(startDefault);
    $("end-date").value = dateInput(endDefault);
    let tempChart, humidityChart;
    let currentRows = [];

    function downloadPdfReport() {
      if (!currentRows.length) {
        showError("room-error", "There are no readings to export for the selected time range.");
        return;
      }
      const JsPDF = window.jspdf && window.jspdf.jsPDF;
      if (!JsPDF) {
        showError("room-error", "The PDF library could not be loaded. Check the internet connection, or host jsPDF on the server.");
        return;
      }
      const doc = new JsPDF({orientation: "landscape", unit: "mm", format: "a4"});
      const startDate = $("start-date").value;
      const endDate = $("end-date").value;
      const granularity = $("granularity").value;
      const granularityLabel = {day: "Daily average", week: "Weekly average", month: "Monthly average", raw: "Individual readings"}[granularity] || granularity;
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const tempValues = currentRows.map(r => Number(r.temp)).filter(Number.isFinite);
      const humidityValues = currentRows.map(r => Number(r.humidity)).filter(Number.isFinite);
      const average = values => values.length ? (values.reduce((a, b) => a + b, 0) / values.length).toLocaleString("en-US", {minimumFractionDigits: 1, maximumFractionDigits: 1}) : "—";

      doc.setFont("helvetica", "bold");
      doc.setFontSize(20);
      doc.text("Indoor climate report", 14, 17);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(12);
      doc.text(`Room: ${roomName}`, 14, 25);
      doc.setFontSize(10);
      doc.text(`Range: ${startDate} to ${endDate}`, 14, 32);
      doc.text(`Grouping: ${granularityLabel}`, 14, 38);
      doc.text(`Created: ${new Date().toLocaleString("en-US")}`, pageWidth - 14, 17, {align: "right"});

      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(`Average temperature: ${average(tempValues)} °C`, 14, 48);
      doc.text(`Average humidity: ${average(humidityValues)} %`, 105, 48);
      doc.text(`Intervals: ${currentRows.length}`, 220, 48);

      let tableStartY = 58;
      try {
        const tempCanvas = $("detail-temp-chart");
        const humidityCanvas = $("detail-humidity-chart");
        if (tempCanvas && humidityCanvas && tempCanvas.width && humidityCanvas.width) {
          doc.addImage(tempCanvas.toDataURL("image/png", 1), "PNG", 14, 54, 128, 48);
          doc.addImage(humidityCanvas.toDataURL("image/png", 1), "PNG", 151, 54, 128, 48);
          tableStartY = 108;
        }
      } catch (error) {
        // The PDF can still be created without chart images.
      }

      const body = currentRows.map(row => [
        timeLabel(row.time, granularity),
        row.temp == null ? "—" : `${fmt(row.temp)} °C`,
        row.humidity == null ? "—" : `${fmt(row.humidity)} %`,
        row.minTemp == null ? "—" : `${fmt(row.minTemp)} °C`,
        row.maxTemp == null ? "—" : `${fmt(row.maxTemp)} °C`,
        row.minHumidity == null ? "—" : `${fmt(row.minHumidity)} %`,
        row.maxHumidity == null ? "—" : `${fmt(row.maxHumidity)} %`
      ]);
      doc.autoTable({
        startY: tableStartY,
        head: [["Interval", "Avg. temperature", "Avg. humidity", "Min. temp.", "Max. temp.", "Min. humidity", "Max. humidity"]],
        body,
        theme: "striped",
        margin: {left: 14, right: 14, top: 14, bottom: 14},
        styles: {font: "helvetica", fontSize: 8, cellPadding: 2, overflow: "linebreak"},
        headStyles: {fillColor: [48, 91, 150]},
        columnStyles: {0: {cellWidth: 48}},
        didDrawPage: () => {
          doc.setFontSize(8);
          doc.setTextColor(110);
          doc.text("Indoor climate · Sensor dashboard", 14, pageHeight - 7);
          doc.text(`Page ${doc.internal.getNumberOfPages()}`, pageWidth - 14, pageHeight - 7, {align: "right"});
        }
      });
      const safeRoomName = roomName.normalize("NFKD").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "room";
      doc.save(`indoor-climate-${safeRoomName}-${startDate}-to-${endDate}.pdf`);
    }

    $("download-pdf").addEventListener("click", downloadPdfReport);

    async function load() {
      clearError("room-error");
      const startDate = $("start-date").value;
      const endDate = $("end-date").value;
      const granularity = $("granularity").value;
      if (!startDate || !endDate || startDate > endDate) {
        showError("room-error", "Choose a valid time range. The start date must not be after the end date.");
        return;
      }
      $("apply-filters").disabled = true;
      try {
        const start = `${startDate} 00:00:00`;
        const end = `${endDate} 23:59:59`;
        let tempRows = await readRoom(roomId, start, end, granularity);
        const rows = tempRows.reverse();
        currentRows = rows;
        $("download-pdf").disabled = rows.length === 0;
        const labels = rows.map(r => timeLabel(r.time, granularity));
        const tempData = rows.map(r => r.temp == null ? null : Number(r.temp));
        const humidityData = rows.map(r => r.humidity == null ? null : Number(r.humidity));
        const validTemp = tempData.filter(Number.isFinite);
        const validHumidity = humidityData.filter(Number.isFinite);
        $("metric-temp").textContent = validTemp.length ? `${fmt(validTemp.reduce((a,b)=>a+b,0)/validTemp.length)} °C` : "—";
        $("metric-humidity").textContent = validHumidity.length ? `${fmt(validHumidity.reduce((a,b)=>a+b,0)/validHumidity.length)} %` : "—";
        $("metric-count").textContent = rows.length.toLocaleString("en-US");
        if (tempChart) tempChart.destroy();
        if (humidityChart) humidityChart.destroy();
        tempChart = makeChart($("detail-temp-chart"), labels, [{label:"Temperature (°C)",data:tempData,color:"#3978f6"}]);
        humidityChart = makeChart($("detail-humidity-chart"), labels, [{label:"Humidity (%)",data:humidityData,color:"#12a594"}], {scales:{x:{grid:{display:false},ticks:{maxTicksLimit:8,maxRotation:0,color:"#8994a6",font:{size:10}}},y:{min:0,max:100,grid:{color:"#edf0f5"},ticks:{color:"#8994a6",font:{size:10}}}}});
        const tbody = $("summary-table");
        tbody.innerHTML = "";
        if (!rows.length) {
          tbody.innerHTML = '<tr><td colspan="7">No data in the selected time range.</td></tr>';
        } else {
          rows.forEach(row => {
            const tr = document.createElement("tr");
            const cells = [timeLabel(row.time,granularity), row.temp == null ? "—" : `${fmt(row.temp)} °C`, row.humidity == null ? "—" : `${fmt(row.humidity)} %`, row.minTemp == null ? "—" : `${fmt(row.minTemp)} °C`, row.maxTemp == null ? "—" : `${fmt(row.maxTemp)} °C`, row.minHumidity == null ? "—" : `${fmt(row.minHumidity)} %`, row.maxHumidity == null ? "—" : `${fmt(row.maxHumidity)} %`];
            cells.forEach((value,i) => { const td = document.createElement("td"); td.textContent = value; if (i===0) td.style.textAlign="left"; tr.appendChild(td); });
            tbody.appendChild(tr);
          });
        }
      } catch (error) {
        $("download-pdf").disabled = true;
        showError("room-error", error.message);
      } finally {
        $("apply-filters").disabled = false;
      }
    }
    $("apply-filters").addEventListener("click", load);
    await load();
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (document.body.dataset.page === "overview") initOverview();
    if (document.body.dataset.page === "room") initRoom();
  });
})();
