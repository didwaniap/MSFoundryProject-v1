export function estimateTokens(text) {
  return Math.ceil(String(text || "").trim().length / 4);
}

function numberFromEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export function createTokenGovernor({ appKey, businessUnit, defaults }) {
  const limits = {
    request: numberFromEnv("TOKEN_LIMIT_PER_REQUEST", defaults.request),
    session: numberFromEnv("TOKEN_LIMIT_PER_SESSION", defaults.session),
    userDaily: numberFromEnv("TOKEN_LIMIT_PER_USER_DAILY", defaults.userDaily || 100000),
    appDaily: numberFromEnv("TOKEN_LIMIT_PER_APP_DAILY", defaults.appDaily || 500000),
    businessUnitDaily: numberFromEnv("TOKEN_LIMIT_PER_BU_DAILY", defaults.businessUnitDaily || 1000000),
    warningThresholdPercent: numberFromEnv("TOKEN_WARNING_THRESHOLD_PERCENT", defaults.warningThresholdPercent || 80)
  };
  const sessions = new Map();
  const userDaily = new Map();
  let appDaily = { date: todayKey(), totalTokens: 0 };
  let businessUnitDaily = { date: todayKey(), totalTokens: 0 };

  function resetIfNeeded() {
    const date = todayKey();
    if (appDaily.date !== date) appDaily = { date, totalTokens: 0 };
    if (businessUnitDaily.date !== date) businessUnitDaily = { date, totalTokens: 0 };
  }

  function getUserBucket(userId) {
    resetIfNeeded();
    const key = `${todayKey()}:${userId || "demo-user"}`;
    const current = userDaily.get(key) || { totalTokens: 0 };
    userDaily.set(key, current);
    return current;
  }

  function block(scope, nextTotal, limit) {
    return {
      allowed: false,
      status: "blocked",
      message: `${scope} token estimate ${nextTotal} exceeds the configured limit ${limit}.`,
      scope,
      nextTotal,
      limit
    };
  }

  function checkRequest(promptTokens) {
    if (promptTokens > limits.request) {
      return block("Request", promptTokens, limits.request);
    }
    return { allowed: true };
  }

  function recordUsage({ sessionId, userId = "demo-user", promptTokens, completionTokens }) {
    resetIfNeeded();
    const totalTokens = promptTokens + completionTokens;
    const session = sessions.get(sessionId) || { promptTokens: 0, completionTokens: 0 };
    const user = getUserBucket(userId);

    const nextSessionTotal = session.promptTokens + session.completionTokens + totalTokens;
    if (nextSessionTotal > limits.session) return block("Session", nextSessionTotal, limits.session);

    const nextUserDaily = user.totalTokens + totalTokens;
    if (nextUserDaily > limits.userDaily) return block("User daily", nextUserDaily, limits.userDaily);

    const nextAppDaily = appDaily.totalTokens + totalTokens;
    if (nextAppDaily > limits.appDaily) return block("App daily", nextAppDaily, limits.appDaily);

    const nextBusinessUnitDaily = businessUnitDaily.totalTokens + totalTokens;
    if (nextBusinessUnitDaily > limits.businessUnitDaily) {
      return block("Business unit daily", nextBusinessUnitDaily, limits.businessUnitDaily);
    }

    const usage = {
      promptTokens: session.promptTokens + promptTokens,
      completionTokens: session.completionTokens + completionTokens,
      totalTokens: nextSessionTotal,
      tokenLimitPerSession: limits.session,
      userDailyTokens: nextUserDaily,
      tokenLimitPerUserDaily: limits.userDaily,
      appDailyTokens: nextAppDaily,
      tokenLimitPerAppDaily: limits.appDaily,
      businessUnitDailyTokens: nextBusinessUnitDaily,
      tokenLimitPerBusinessUnitDaily: limits.businessUnitDaily,
      warning:
        nextSessionTotal >= limits.session * (limits.warningThresholdPercent / 100)
          ? `${limits.warningThresholdPercent}% of the session token limit has been reached.`
          : ""
    };

    sessions.set(sessionId, {
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens
    });
    user.totalTokens = nextUserDaily;
    appDaily.totalTokens = nextAppDaily;
    businessUnitDaily.totalTokens = nextBusinessUnitDaily;

    return {
      allowed: true,
      usage,
      policy: {
        appKey,
        businessUnit,
        limits
      }
    };
  }

  return {
    limits,
    checkRequest,
    recordUsage
  };
}
