var workerHashrateData;
var workerHashrateChart;
var workerHistoryMax = 160;

var statData;
var totalHash;
var totalImmature;
var totalBal;
var totalPaid;
var totalShares;

// A number from the API, or 0 when it is missing, text, NaN or Infinity.
function toNumber(v) {
	var n = parseFloat(v);
	return isFinite(n) ? n : 0;
}

function formatDGB(v) {
	return toNumber(v).toLocaleString('en-US', { maximumFractionDigits: 8 }) + ' DGB';
}

function formatDiff(v) {
	var n = parseFloat(v);
	return isFinite(n) ? String(n) : '-';
}

function objectKeys(o) {
	return (o && typeof o === 'object') ? Object.keys(o) : [];
}

function getReadableHashRateString(hashrate){
	hashrate = (parseFloat(hashrate) * 1000000);
	if (!isFinite(hashrate) || hashrate < 1000000) {
		return '0 H/s';
	}
	var byteUnits = [' H/s', ' KH/s', ' MH/s', ' GH/s', ' TH/s', ' PH/s', ' EH/s', ' ZH/s', ' YH/s' ];
	var i = Math.floor((Math.log(hashrate/1000) / Math.log(1000)) - 1);
	i = Math.max(0, Math.min(byteUnits.length - 1, i));
	hashrate = (hashrate/1000) / Math.pow(1000, i + 1);
	return hashrate.toFixed(2) + byteUnits[i];
}

function getReadableLuckTime(lucktime){
        var luck = parseFloat(lucktime); // the API sends luckDays as a string
        if (!isFinite(luck) || luck < 0) return '-'; // no workers: 1/0 = Infinity
        var timeUnits = [ ' Days', ' Hours', ' Minutes' ];
        if (luck < 1) {
                luck = luck * 24;
                if (luck < 1) {
                        luck = luck * 60;
                        return luck.toFixed(2) + timeUnits[2];
                } else {
                        return luck.toFixed(2) + timeUnits[1];
                }
        }
        return luck.toFixed(3) + timeUnits[0];
}

function timeOfDayFormat(timestamp){
    var dStr = d3.time.format('%I:%M %p')(new Date(timestamp));
    if (dStr.indexOf('0') === 0) dStr = dStr.slice(1);
    return dStr;
}

function getWorkerNameFromAddress(w) {
	var worker = w;
	if (w.split(".").length > 1) {
		worker = w.split(".")[1];
		if (worker == null || worker.length < 1) {
			worker = "noname";
		}
	} else {
		worker = "noname";
	}
	return worker;
}

function buildChartData(){
    var workers = {};
	for (var w in statData.history) {
		var worker = getWorkerNameFromAddress(w);
		var a = workers[worker] = (workers[worker] || {
			hashrate: []
		});
		for (var wh in statData.history[w]) {
			a.hashrate.push([statData.history[w][wh].time * 1000, statData.history[w][wh].hashrate]);
		}
		if (a.hashrate.length > workerHistoryMax) {
			workerHistoryMax = a.hashrate.length;
		}
	}

	var i=0;
    workerHashrateData = [];
    for (var worker in workers){
        workerHashrateData.push({
            key: worker,
			disabled: (i > Math.min((_workerCount-1), 3)),
            values: workers[worker].hashrate
        });
		i++;
    }
}

function updateChartData(){
    var workers = {};
	for (var w in statData.history) {
		var worker = getWorkerNameFromAddress(w);
		// get a reference to lastest workerhistory
		var wh = undefined;
		for (wh in statData.history[w]) { }
		//var wh = statData.history[w][statData.history[w].length - 1];
		var foundWorker = false;
		for (var i = 0; i < workerHashrateData.length; i++) {
			if (workerHashrateData[i].key === worker) {
				foundWorker = true;
				if (workerHashrateData[i].values.length >= workerHistoryMax) {
					workerHashrateData[i].values.shift();
				}
				if (wh !== undefined) workerHashrateData[i].values.push([statData.history[w][wh].time * 1000, statData.history[w][wh].hashrate]);
				break;
			}
		}
		if (!foundWorker && wh !== undefined) {
			var hashrate = [];
			hashrate.push([statData.history[w][wh].time * 1000, statData.history[w][wh].hashrate]);
			workerHashrateData.push({
				key: worker,
				values: hashrate
			});
			rebuildWorkerDisplay();
			return true;
		}
	}
	triggerChartUpdates();
	return false;
}

function calculateAverageHashrate(worker) {
	var count = 0;
	var total = 1;
	var avg = 0;
	for (var i = 0; i < workerHashrateData.length; i++) {
		count = 0;
		for (var ii = 0; ii < workerHashrateData[i].values.length; ii++) {
			if (worker == null || workerHashrateData[i].key === worker) {
				count++;
				avg += parseFloat(workerHashrateData[i].values[ii][1]);
			}
		}
		if (count > total)
			total = count;
	}
	avg = avg / total;
	return avg;
}

function triggerChartUpdates(){
    if (workerHashrateChart) workerHashrateChart.update();
}

function displayCharts() {
    nv.addGraph(function() {
        workerHashrateChart = nv.models.lineChart()
            .margin({left: 80, right: 30})
            .x(function(d){ return d[0] })
            .y(function(d){ return d[1] })
            .useInteractiveGuideline(true);

        workerHashrateChart.xAxis.tickFormat(timeOfDayFormat);

        workerHashrateChart.yAxis.tickFormat(function(d){
            return getReadableHashRateString(d);
        });
        d3.select('#workerHashrate').datum(workerHashrateData).call(workerHashrateChart);
        return workerHashrateChart;
    });
}

function updateStats() {
	totalHash = statData.totalHash;
	totalPaid = statData.paid;
	totalBal = statData.balance;
	totalImmature = statData.immature;
	// Same number and age as the worker cards: the sum of their round shares (FIRST-TIMER-18)
	totalShares = 0;
	for (var s in statData.workers) totalShares += toNumber(statData.workers[s] && statData.workers[s].currRoundShares);
	// do some calculations: luck of all workers together
	var luckRate = 0;
	for (var w in statData.workers) {
		var l = parseFloat(statData.workers[w] && statData.workers[w].luckDays);
		if (l > 0 && isFinite(l)) luckRate = luckRate + 1 / l;
	}
	var luckDays = luckRate > 0 ? (1 / luckRate) : NaN; // NaN shows as "-"
	// update miner stats
	$("#statsHashrate").text(getReadableHashRateString(totalHash));
	$("#statsHashrateAvg").text(getReadableHashRateString(calculateAverageHashrate(null)));
	$("#statsLuckDays").text(getReadableLuckTime(luckDays));
	$("#statsTotalImmature").text(formatDGB(totalImmature));
	$("#statsTotalBal").text(formatDGB(totalBal));
	$("#statsTotalPaid").text(formatDGB(totalPaid));
	$("#statsTotalShares").text(toNumber(totalShares).toFixed(2));
}
function updateWorkerStats() {
	// update worker stats
	var i=0;
	for (var w in statData.workers) { i++;
		var htmlSafeWorkerName = w.split('.').join('_').replace(/[^\w\s]/gi, '');
		var saneWorkerName = getWorkerNameFromAddress(w);
		$("#statsHashrate"+htmlSafeWorkerName).text(getReadableHashRateString(statData.workers[w].hashrate));
		$("#statsHashrateAvg"+htmlSafeWorkerName).text(getReadableHashRateString(calculateAverageHashrate(saneWorkerName)));
		$("#statsLuckDays"+htmlSafeWorkerName).text(getReadableLuckTime(statData.workers[w].luckDays));
		$("#statsPaid"+htmlSafeWorkerName).text(formatDGB(statData.workers[w].paid));
		$("#statsBalance"+htmlSafeWorkerName).text(formatDGB(statData.workers[w].balance));
		$("#statsShares"+htmlSafeWorkerName).text(Math.round(toNumber(statData.workers[w].currRoundShares) * 100) / 100);
		$("#statsDiff"+htmlSafeWorkerName).text(formatDiff(statData.workers[w].diff));
	}
}
function addWorkerToDisplay(name, htmlSafeName, workerObj) {
	workerObj = workerObj || {};
	var htmlToAdd = "";
	htmlToAdd = '<div class="boxStats" id="boxStatsLeft" style="float:left; margin: 9px; min-width: 260px;"><div class="boxStatsList">';
	htmlToAdd+='<div class="boxLowerHeader">'+name.replace(/[^\w\s]/gi, '')+'</div><div>';
	htmlToAdd+='<div><i class="fas fa-tachometer-alt fa-fw"></i> <span id="statsHashrate'+htmlSafeName+'">'+getReadableHashRateString(workerObj.hashrate)+'</span> (Now)</div>';
	htmlToAdd+='<div><i class="fas fa-tachometer-alt fa-fw"></i> <span id="statsHashrateAvg'+htmlSafeName+'">'+getReadableHashRateString(calculateAverageHashrate(name))+'</span> (Avg)</div>';
	htmlToAdd+='<div><i class="fas fa-unlock-alt fa-fw"></i> <small>Diff:</small> <span id="statsDiff'+htmlSafeName+'">'+formatDiff(workerObj.diff)+'</span></div>';
	htmlToAdd+='<div><i class="fas fa-cog fa-fw"></i> <small>Round shares:</small> <span id="statsShares'+htmlSafeName+'">'+(Math.round(toNumber(workerObj.currRoundShares) * 100) / 100)+'</span></div>';
	htmlToAdd+='<div><i class="fas fa-clock fa-fw"></i> <small>Luck:</small> <span id="statsLuckDays'+htmlSafeName+'">'+getReadableLuckTime(workerObj.luckDays)+'</span></div>';
	htmlToAdd+='<div><i class="fas fa-money-bill-alt fa-fw"></i> <small>Bal:</small> <span id="statsBalance'+htmlSafeName+'">'+formatDGB(workerObj.balance)+'</span></div>';
	htmlToAdd+='<div><i class="fas fa-money-bill-alt fa-fw"></i> <small>Paid:</small> <span id="statsPaid'+htmlSafeName+'">'+formatDGB(workerObj.paid)+'</span></div>';
	htmlToAdd+='</div></div></div>';
	$("#boxesWorkers").html($("#boxesWorkers").html()+htmlToAdd);
}

function rebuildWorkerDisplay() {
	$("#boxesWorkers").html("");
	var i=0;
	for (var w in statData.workers) { i++;
		var htmlSafeWorkerName = w.split('.').join('_').replace(/[^\w\s]/gi, '');
		var saneWorkerName = getWorkerNameFromAddress(w);
		addWorkerToDisplay(saneWorkerName, htmlSafeWorkerName, statData.workers[w]);
	}
}

// True when the API knows this address: workers, history or any balance.
// A mistyped or brand-new address gets all zeros, which we must not show as an idle miner.
function hasMinerData(data) {
	if (!data || typeof data !== 'object' || data.result === 'error') return false;
	if (objectKeys(data.workers).length > 0 || objectKeys(data.history).length > 0) return true;
	return toNumber(data.paid) > 0 || toNumber(data.balance) > 0 || toNumber(data.immature) > 0 || toNumber(data.totalShares) > 0;
}

function showMinerData(found) {
	$('#minerNotFound')[found ? 'hide' : 'show']();
	$('.minerData')[found ? 'show' : 'hide']();
}

var minerDisplayReady = false;

function startMinerDisplay() {
	showMinerData(true);
	_workerCount = objectKeys(statData.workers).length;
	buildChartData();
	displayCharts();
	rebuildWorkerDisplay();
	updateStats();
	minerDisplayReady = true;
}

// resize chart on window resize
nv.utils.windowResize(triggerChartUpdates);

// grab initial stats
$.getJSON('/api/worker_stats?'+_miner, function(data){
    statData = data;
	if (!hasMinerData(statData)) {
		showMinerData(false);
		return;
	}
	startMinerDisplay();
});

// live stat updates
statsSource.addEventListener('message', function(e){
	if (document.hidden) return;
	
	// TODO, create miner_live_stats...
	// miner_live_stats will return the same josn except without the worker history
	// FOR NOW, use this to grab updated stats
	$.getJSON('/api/worker_stats?'+_miner, function(data){
		statData = data;
		if (!hasMinerData(statData)) {
			if (!minerDisplayReady) showMinerData(false);
			return;
		}
		if (!minerDisplayReady) {
			startMinerDisplay();
			return;
		}
		// check for missing workers
		var wc = objectKeys(statData.workers).length;
		var rebuilt = false;
		// TODO, this isn't 100% fool proof!
		if (_workerCount != wc) {
			if (_workerCount > wc) {
				rebuildWorkerDisplay();
				rebuilt = true;
			}
			_workerCount = wc;
		}
		rebuilt = (rebuilt || updateChartData());
		updateStats();
		if (!rebuilt) {
			updateWorkerStats();
		}
	});
});
