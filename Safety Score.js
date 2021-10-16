// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: pink; icon-glyph: car;

async function request(url, opts) {
  try {
    const request = new Request(url);

    request.method = opts.method;
    request.headers = opts.headers;
    if (opts.body != undefined) request.body = JSON.stringify(opts.body);

    var result = await request.loadJSON();
    // console.log(result);
    return result;
  } catch (err) {
    console.log(err);

    return undefined;
  }
}

async function showErrorMessage(widget, message) {
  let msg = widget.addText(message);

  msg.textColor = Color.red();
  msg.centerAlignText();
  msg.font = Font.heavyMonospacedSystemFont(13);

  if (!config.runsInWidget) {
    widget.presentSmall();
  }

  Script.setWidget(widget);
  Script.complete();
}

async function run() {
  let widget = new ListWidget();
  widget.backgroundColor = Color.black();

  const fm = FileManager.iCloud();

  const configPath = fm.documentsDirectory() + "/safetyScoreConfig.json";
  const statePath = fm.documentsDirectory() + "/safetyScoreState.json";
  if (!fm.fileExists(configPath)) {
    await showErrorMessage(widget, "Please run the configurator script first");
    return;
  }

  var state = {};
  if (fm.fileExists(statePath)) {
    if (fm.isFileStoredIniCloud(statePath) && !fm.isFileDownloaded(statePath)) {
      console.log("State file in iCloud but not downloaded");
      await fm.downloadFileFromiCloud(statePath);
    }
    state = JSON.parse(fm.readString(statePath));
  }

  if (fm.isFileStoredIniCloud(configPath) && !fm.isFileDownloaded(configPath)) {
    console.log("Config file in iCloud but not downloaded");
    await fm.downloadFileFromiCloud(configPath);
  }
  const configText = fm.readString(configPath);
  var widgetConfig = JSON.parse(configText);

  var vehicleIdx = 0;
  if (args.widgetParameter != undefined) {
    vehicleIdx = parseInt(args.widgetParameter) - 1;
  }

  if (vehicleIdx >= widgetConfig.count) {
    await showErrorMessage(widget, "There is no vehicle with index " + args.widgetParameter);
    return;
  }

  const refreshToken = widgetConfig.refreshToken;
  const vehicleName = widgetConfig.vehicles[vehicleIdx].display_name;
  const VIN = widgetConfig.vehicles[vehicleIdx].vin;
  const TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

  var vehicleState = state.hasOwnProperty(VIN)
    ? state[VIN]
    : {
        safetyScore: 0,
        lastChange: 0,
        totalMilesDriven: 0,
      };

  const authResponse = await request("https://auth.tesla.com/oauth2/v3/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "tesla/widget",
    },
    body: {
      grant_type: "refresh_token",
      client_id: "ownerapi",
      scope: "openid email offline_access",
      refresh_token: refreshToken,
    },
  });

  if (authResponse == undefined) {
    await showErrorMessage(widget, "Communication\nFailure");
    return;
  }

  if (authResponse.hasOwnProperty("error_description")) {
    await showErrorMessage(widget, authResponse.error_description);
    return;
  }

  widgetConfig.refreshToken = refreshToken;
  fm.writeString(configPath, JSON.stringify(widgetConfig));

  const scoreResponse = await request(
    "https://akamai-apigateway-vfx.tesla.com/safety-rating/daily-metrics?deviceLanguage=en&deviceCountry=US&vin=" + VIN + "&timezone=" + TIMEZONE,
    {
      method: "GET",
      headers: {
        Authorization: "Bearer " + authResponse.access_token,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: undefined,
    }
  );

  if (scoreResponse == undefined) {
    await showErrorMessage(widget, "Communication\nFailure");
    return;
  }

  if (!scoreResponse.hasOwnProperty("rangeAggregation")) {
    if (scoreResponse.hasOwnProperty("message")) {
      await showErrorMessage(widget, scoreResponse.message);
      return;
    } else {
      await showErrorMessage(widget, "Communication\nFailure");
      return;
    }
  }

  var previousScore = vehicleState.safetyScore;
  var previousTotalMilesDriven = vehicleState.totalMilesDriven;

  vehicleState.safetyScore = scoreResponse.rangeAggregation.metrics.safetyScore;
  
  var change = 0;
  var totalMilesDriven = 0;
  for (var i = 0; i < scoreResponse.dailyAggregation.metrics.length; i++) {
    var dayMetrics = scoreResponse.dailyAggregation.metrics[i];
    totalMilesDriven += dayMetrics.milesDriven;
  }

  if (previousScore != vehicleState.safetyScore || previousTotalMilesDriven != totalMilesDriven) {
    if (previousScore != vehicleState.safetyScore) {
      change = vehicleState.safetyScore - previousScore;
      vehicleState.lastChange = change;
    }
    vehicleState.totalMilesDriven = totalMilesDriven;

    state[VIN] = vehicleState;
    fm.writeString(statePath, JSON.stringify(state));
  }

  if (change == 0 && previousTotalMilesDriven == totalMilesDriven) {
    change = vehicleState.lastChange;
  }

  if (previousScore != vehicleState.safetyScore) {
    Notification.removeDelivered(["safetyScore"]);
    Notification.removePending(["safetyScore"]);

    const notification = new Notification();
    const changeText = change > 0 ? "increased" : "decreased";
    notification.body = "Your safety score " + changeText + " by " + Math.abs(vehicleState.safetyScore - previousScore).toString() + " points";
    notification.identifier = "safetyScore";
    notification.schedule();
  }

  var fontSizeAdjustment = 0;
  var scoreFontSizeAdjustment = 0;
  if (config.widgetFamily == "large") {
      fontSizeAdjustment = 20;
      scoreFontSizeAdjustment = 40;
  }


  let daysDriven = widget.addText(scoreResponse.dailyAggregation.metrics.length.toString() + " days");
  daysDriven.centerAlignText();
  daysDriven.textColor = Color.white();
  daysDriven.shadowColor = Color.blue();
  daysDriven.shadowOffset = new Point(2, 2);
  daysDriven.shadowRadius = 4;
  daysDriven.font = Font.blackRoundedSystemFont(14 + fontSizeAdjustment);

  widget.addSpacer();

  const scoreRow = widget.addStack();
  scoreRow.bottomAlignContent();
  scoreRow.layoutHorizontally();
  scoreRow.addSpacer();

  let text = scoreRow.addText(vehicleState.safetyScore.toString());
  text.centerAlignText();
  text.textColor = Color.white();
  text.shadowColor = Color.blue();
  text.shadowOffset = new Point(2, 2);
  text.shadowRadius = 4;
  text.font = Font.blackRoundedSystemFont(56 + scoreFontSizeAdjustment);

  if (change != 0) {
    const deviationStack = scoreRow.addStack();
    deviationStack.layoutVertically();
    deviationStack.topAlignContent();
    deviationStack.spacing = -5;

    const arrow = deviationStack.addText(change > 0 ? "↑" : "↓");
    arrow.textColor = change > 0 ? Color.green() : Color.red();
    arrow.font = Font.mediumMonospacedSystemFont(12 + fontSizeAdjustment);
    const sign = change > 0 ? "+" : "-";
    const diff = deviationStack.addText(sign + Math.abs(change).toString());
    diff.textColor = change > 0 ? Color.green() : Color.red();
    diff.font = Font.mediumMonospacedSystemFont(12 + fontSizeAdjustment);
  }

  scoreRow.addSpacer();

  widget.addSpacer();

  let milesDriven = widget.addText(scoreResponse.rangeAggregation.metrics.milesDriven.toString() + " mi");
  milesDriven.centerAlignText();
  milesDriven.textColor = Color.white();
  milesDriven.shadowColor = Color.blue();
  milesDriven.shadowOffset = new Point(2, 2);
  milesDriven.shadowRadius = 4;
  milesDriven.font = Font.blackRoundedSystemFont(16 + fontSizeAdjustment);

  let textVehicleName = widget.addText(vehicleName);
  textVehicleName.centerAlignText();
  textVehicleName.textColor = Color.white();
  textVehicleName.shadowColor = Color.blue();
  textVehicleName.shadowOffset = new Point(2, 2);
  textVehicleName.shadowRadius = 4;
  textVehicleName.font = Font.blackRoundedSystemFont(20 + fontSizeAdjustment);

  widget.setPadding(12, 12, 12, 12);

  if (!widgetConfig.runsInWidget) {
    widget.presentSmall();
  }

  Script.setWidget(widget);
  Script.complete();
  }

  await run();
