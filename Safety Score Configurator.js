// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: light-gray; icon-glyph: cogs;

async function showErrorMessage(widget, message) {
  let msg = widget.addText(message);

  msg.textColor = Color.red();
  msg.centerAlignText();
  msg.font = Font.heavyMonospacedSystemFont(13);

  Script.setWidget(widget);
  Script.complete();
}

function presentAlert(message) {
  const alert = new Alert();
  alert.message = message;
  alert.addAction("OK");
  return alert.presentAlert();
}

async function buildConfig(refreshToken) {
  const TESLA_CLIENT_ID = "81527cff06843c8634fdc09e8ac0abefb46ac849f38fe1e431c2ef2106796384";
  const TESLA_CLIENT_SECRET = "c7257eb71a564034f9419ee651c7d0e5f7aa6bfbd18bafb5c5c033b093bb2fa3";

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

  const tokenResponse = await request("https://owner-api.teslamotors.com/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: "Bearer " + authResponse.access_token,
    },
    body: {
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      client_id: TESLA_CLIENT_ID,
      client_secret: TESLA_CLIENT_SECRET,
    },
  });

  const vehiclesData = await request("https://owner-api.teslamotors.com/api/1/vehicles", {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: "Bearer " + tokenResponse.access_token,
    },
    body: undefined,
  });

  if (vehiclesData.count < 1) {
    throw new Error("No vehicles registered on this account");
  } else {
    var vehicles = [];
    for (let vehicle of vehiclesData.response) {
      vehicles.push({
        display_name: vehicle.display_name,
        vin: vehicle.vin,
      });
    }
    return await Promise.resolve({
      refreshToken: refreshToken,
      count: vehiclesData.count,
      vehicles: vehicles,
    });
  }
}

async function request(url, opts) {
  try {
    const request = new Request(url);

    request.method = opts.method;
    request.headers = opts.headers;
    if (opts.body != undefined) request.body = JSON.stringify(opts.body);

    var result = await request.loadJSON();

    return result;
  } catch (err) {
    console.log(err);

    return undefined;
  }
}

async function run() {
  let widget = new ListWidget();
  widget.backgroundColor = Color.white();

  const fm = FileManager.iCloud();
  const configPath = fm.documentsDirectory() + "/safetyScoreConfig.json";

  if (!config.runsInWidget) {
    widget.presentMedium();
    const alert = new Alert();
    alert.message = "Refresh Token";
    alert.addTextField("Refresh Token", "");
    alert.addAction("OK");
    alert.addCancelAction("Cancel");
    alert.presentAlert().then(
      (idx) => {
        if (idx == -1) {
          showErrorMessage(widget, "Canceled\nPlease run again");
        } else {
          const refreshToken = alert.textFieldValue(0);
          buildConfig(refreshToken)
            .then((configJSON) => {
              fm.writeString(configPath, JSON.stringify(configJSON));
              presentAlert("Widget configured");
            })
            .catch((err) => {
              presentAlert(err);
            });
        }
      },
      function () {
        showErrorMessage(widget, "Canceled\nPlease run again");
      }
    );
  } else {
    await showErrorMessage(widget, "Please run\nin the app");
  }
}

await run();