/**
 * AR 沙盘客户端指标重算 — 按时间筛选联动城市/商圈/门店
 */
(function (global) {
  "use strict";

  var BRAND_ID = "haidilao";
  var BRAND_NAME = "海底捞";

  function slugify(value) {
    return String(value || "item").toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "_");
  }

  function inDateRange(date, from, to) {
    var d = String(date || "");
    return d >= from && d <= to;
  }

  function filterByDateRange(rows, from, to) {
    return (rows || []).filter(function (row) {
      return inDateRange(row.date, from, to);
    });
  }

  function filterMonthsByRange(rows, from, to) {
    return (rows || []).filter(function (row) {
      return inDateRange(row.month, from, to);
    });
  }

  function filterPoiFactsByMonth(rows, monthKey) {
    if (!monthKey) return rows || [];
    var prefix = String(monthKey).slice(0, 7);
    return (rows || []).filter(function (row) {
      return String(row.date || "").startsWith(prefix);
    });
  }

  function sumRows(rows, fields) {
    var totals = {};
    fields.forEach(function (field) {
      totals[field] = 0;
    });
    (rows || []).forEach(function (row) {
      fields.forEach(function (field) {
        totals[field] += Number(row[field] || 0);
      });
    });
    return totals;
  }

  function monthRangeLabel(year, monthNum) {
    var pad = String(monthNum).padStart(2, "0");
    var lastDay = new Date(year, monthNum, 0).getDate();
    return {
      label: year + "年" + monthNum + "月",
      range: year + "-" + pad + "-01 至 " + year + "-" + pad + "-" + String(lastDay).padStart(2, "0"),
      grain: "自然月"
    };
  }

  function monthLabelFromKey(monthKey) {
    if (!monthKey) return "";
    var parts = String(monthKey).split("-");
    if (parts.length < 2) return monthKey;
    return monthRangeLabel(Number(parts[0]), parseInt(parts[1], 10)).label;
  }

  function pickLatestMonthKey(rows) {
    var months = [];
    (rows || []).forEach(function (row) {
      if (row.month) months.push(String(row.month));
    });
    months = months.filter(function (value, index, list) {
      return list.indexOf(value) === index;
    }).sort();
    return months.length ? months[months.length - 1] : null;
  }

  function pickMonthKeyFromRows(rows, monthNum, year) {
    if (!monthNum) return pickLatestMonthKey(rows);
    var pad = String(monthNum).padStart(2, "0");
    var prefix = year + "-" + pad;
    var candidates = [];
    (rows || []).forEach(function (row) {
      if (row.month) candidates.push(String(row.month));
    });
    candidates = candidates.filter(function (value, index, list) {
      return list.indexOf(value) === index;
    }).sort();
    for (var i = 0; i < candidates.length; i++) {
      if (candidates[i].indexOf(prefix) === 0) return candidates[i];
    }
    return null;
  }

  function periodFromFilter(filter, drillSource) {
    var bounds = (drillSource && drillSource.dateBounds) || {
      from: "2024-01-01",
      to: "2026-06-30",
      label: "2024年1月至2026年6月"
    };
    var monthlyRows = (drillSource && drillSource.monthlyFacts) || [];

    if (!filter || filter.mode === "month") {
      var monthKey = filter && filter.monthKey ? filter.monthKey : pickLatestMonthKey(monthlyRows);
      if (!monthKey) {
        return {
          mode: "cumulative",
          from: bounds.from,
          to: bounds.to,
          label: bounds.label + "（累计）",
          range: bounds.from + " 至 " + bounds.to,
          grain: "累计"
        };
      }
      var parts = monthKey.split("-");
      var labelInfo = monthRangeLabel(Number(parts[0]), parseInt(parts[1], 10));
      return {
        mode: "month",
        monthKey: monthKey,
        label: labelInfo.label,
        range: labelInfo.range,
        grain: "自然月"
      };
    }

    var from = filter.from || bounds.from;
    var to = filter.to || bounds.to;
    var presetLabel = filter.presetLabel || "";
    if (filter.preset === "h1-2026") {
      from = "2026-01-01";
      to = "2026-06-30";
      presetLabel = "2026年上半年";
    } else if (filter.preset === "y2026") {
      from = "2026-01-01";
      to = pickLatestMonthKey(monthlyRows) || "2026-06-30";
      presetLabel = "2026年至今";
    } else if (filter.preset === "full") {
      from = bounds.from;
      to = bounds.to;
      presetLabel = bounds.label + "（累计）";
    }

    return {
      mode: "cumulative",
      from: from,
      to: to,
      label: presetLabel || from.slice(0, 7) + " 至 " + to.slice(0, 7),
      range: from + " 至 " + to,
      grain: filter.preset === "h1-2026" ? "半年度累计" : "区间累计"
    };
  }

  function aggregateBrandMonth(rows, monthKey) {
    var row = {};
    (rows || []).some(function (item) {
      if (String(item.month) === monthKey) {
        row = item;
        return true;
      }
      return false;
    });
    return {
      brandId: BRAND_ID,
      brandName: BRAND_NAME,
      gtv: Number(row.gtv || 0),
      gmv: Math.round(Number(row.gtv || 0) / 8.6),
      paidOrders: Number(row.paid_orders || 0),
      verifiedOrders: Number(row.verified_orders || 0),
      verifiedRate: row.paid_orders ? Number(row.verified_orders) / Number(row.paid_orders) : 0,
      avgOrderValue: Number(row.avg_order_value || 0),
      storeCount: null,
      months: 1
    };
  }

  function aggregateBrandMonthlyInRange(rows, from, to) {
    var filtered = filterMonthsByRange(rows, from, to);
    var totals = sumRows(filtered, ["gtv", "paid_orders", "verified_orders"]);
    var gmvProxy = filtered.reduce(function (sum, row) {
      return sum + Number(row.gtv || 0) / 8.6;
    }, 0);
    var avgOrderValue = totals.paid_orders ? gmvProxy / totals.paid_orders : 0;
    return {
      brandId: BRAND_ID,
      brandName: BRAND_NAME,
      gtv: totals.gtv,
      gmv: Math.round(gmvProxy),
      paidOrders: totals.paid_orders,
      verifiedOrders: totals.verified_orders,
      verifiedRate: totals.paid_orders ? totals.verified_orders / totals.paid_orders : 0,
      avgOrderValue: avgOrderValue,
      storeCount: null,
      months: filtered.length
    };
  }

  function aggregateCityMonth(rows, monthKey) {
    return (rows || [])
      .filter(function (row) {
        return String(row.month) === monthKey;
      })
      .map(function (row) {
        return {
          city: row.city,
          store_count: row.store_count || 0,
          gmv: Number(row.gmv || 0),
          paid_orders: Number(row.paid_orders || 0),
          verified_orders: Number(row.verified_orders || 0),
          ad_spend: Number(row.ad_spend || 0),
          verifiedRate: row.paid_orders ? Number(row.verified_orders) / Number(row.paid_orders) : 0,
          roi: row.ad_spend ? Number(row.gmv) / Number(row.ad_spend) : 0,
          avgOrderValue: row.avg_order_value || (row.paid_orders ? Number(row.gmv) / Number(row.paid_orders) : 0)
        };
      });
  }

  function aggregateCityMonthlyInRange(rows, from, to) {
    var filtered = filterMonthsByRange(rows, from, to);
    var grouped = {};
    filtered.forEach(function (row) {
      var key = row.city;
      if (!grouped[key]) {
        grouped[key] = {
          city: row.city,
          store_count: row.store_count || 0,
          gmv: 0,
          paid_orders: 0,
          verified_orders: 0,
          ad_spend: 0
        };
      }
      grouped[key].gmv += Number(row.gmv || 0);
      grouped[key].paid_orders += Number(row.paid_orders || 0);
      grouped[key].verified_orders += Number(row.verified_orders || 0);
      grouped[key].ad_spend += Number(row.ad_spend || 0);
    });
    return Object.keys(grouped).map(function (city) {
      var row = grouped[city];
      return {
        city: row.city,
        store_count: row.store_count,
        gmv: row.gmv,
        paid_orders: row.paid_orders,
        verified_orders: row.verified_orders,
        ad_spend: row.ad_spend,
        verifiedRate: row.paid_orders ? row.verified_orders / row.paid_orders : 0,
        roi: row.ad_spend ? row.gmv / row.ad_spend : 0,
        avgOrderValue: row.paid_orders ? row.gmv / row.paid_orders : 0
      };
    });
  }

  function aggregatePoiFactsInRange(rows, from, to) {
    return filterByDateRange(rows, from, to).reduce(function (acc, row) {
      var id = row.poi_id;
      if (!id) return acc;
      var current = acc[id] || {
        exposure: 0,
        visits: 0,
        search_visits: 0,
        deal_clicks: 0,
        favorite_count: 0,
        navigate_clicks: 0,
        phone_clicks: 0,
        avg_stay_seconds: 0,
        samples: 0,
        city: row.city,
        business_area: row.business_area
      };
      current.exposure += Number(row.exposure || 0);
      current.visits += Number(row.visits || 0);
      current.search_visits += Number(row.search_visits || 0);
      current.deal_clicks += Number(row.deal_clicks || 0);
      current.favorite_count += Number(row.favorite_count || 0);
      current.navigate_clicks += Number(row.navigate_clicks || 0);
      current.phone_clicks += Number(row.phone_clicks || 0);
      current.avg_stay_seconds += Number(row.avg_stay_seconds || 0);
      current.samples += 1;
      acc[id] = current;
      return acc;
    }, {});
  }

  function buildDrillMetrics(drillSource, period) {
    var brandName =
      (drillSource.brandProfile && drillSource.brandProfile.brand_name) || BRAND_NAME;
    var brandRow;
    var cityRows;
    var poiFactRows;
    var poiFrom;
    var poiTo;

    if (period.mode === "month" && period.monthKey) {
      brandRow = aggregateBrandMonth(drillSource.monthlyFacts, period.monthKey);
      cityRows = aggregateCityMonth(drillSource.cityMonthlyFacts, period.monthKey);
      poiFactRows = filterPoiFactsByMonth(drillSource.poiFacts, period.monthKey);
      poiFrom = period.monthKey.slice(0, 7) + "-01";
      poiTo = period.monthKey;
    } else {
      brandRow = aggregateBrandMonthlyInRange(
        drillSource.monthlyFacts,
        period.from,
        period.to
      );
      cityRows = aggregateCityMonthlyInRange(
        drillSource.cityMonthlyFacts,
        period.from,
        period.to
      );
      poiFactRows = filterByDateRange(drillSource.poiFacts, period.from, period.to);
      poiFrom = period.from;
      poiTo = period.to;
    }

    brandRow.brandName = brandName;
    brandRow.storeCount = (drillSource.poisCatalog || []).length;

    var poiFactsById = aggregatePoiFactsInRange(poiFactRows, poiFrom, poiTo);
    var pois = (drillSource.poisCatalog || []).map(function (poi) {
      var metrics = poiFactsById[poi.poi_id] || {};
      var avgStaySeconds = metrics.samples ? metrics.avg_stay_seconds / metrics.samples : 0;
      return {
        id: poi.poi_id,
        name: poi.poi_name,
        city: poi.city,
        district: poi.district,
        businessArea: poi.business_area,
        brandId: poi.brand_id || BRAND_ID,
        brandName: brandName,
        metrics: {
          exposure: metrics.exposure || 0,
          visits: metrics.visits || 0,
          dealClicks: metrics.deal_clicks || 0,
          navigateClicks: metrics.navigate_clicks || 0,
          phoneClicks: metrics.phone_clicks || 0,
          avgStaySeconds: avgStaySeconds,
          visitRate: metrics.exposure ? (metrics.visits || 0) / metrics.exposure : 0,
          dealClickRate: metrics.visits ? (metrics.deal_clicks || 0) / metrics.visits : 0
        }
      };
    });

    var districtMap = {};
    pois.forEach(function (poi) {
      var key = poi.city + "::" + (poi.businessArea || "核心商圈");
      var current = districtMap[key] || {
        id: slugify(poi.city + "_" + poi.businessArea),
        name: poi.businessArea || "核心商圈",
        city: poi.city,
        district: poi.district,
        storeCount: 0,
        exposure: 0,
        visits: 0,
        dealClicks: 0,
        navigateClicks: 0,
        phoneClicks: 0,
        pois: []
      };
      current.storeCount += 1;
      current.exposure += poi.metrics.exposure || 0;
      current.visits += poi.metrics.visits || 0;
      current.dealClicks += poi.metrics.dealClicks || 0;
      current.navigateClicks += poi.metrics.navigateClicks || 0;
      current.phoneClicks += poi.metrics.phoneClicks || 0;
      current.pois.push(poi.id);
      districtMap[key] = current;
    });

    var districts = Object.keys(districtMap).map(function (key) {
      var item = districtMap[key];
      return {
        id: item.id,
        name: item.name,
        city: item.city,
        district: item.district,
        storeCount: item.storeCount,
        exposure: item.exposure,
        visits: item.visits,
        dealClicks: item.dealClicks,
        navigateClicks: item.navigateClicks,
        phoneClicks: item.phoneClicks,
        pois: item.pois,
        visitRate: item.exposure ? item.visits / item.exposure : 0,
        dealClickRate: item.visits ? item.dealClicks / item.visits : 0
      };
    });

    var cities = cityRows.map(function (row, index) {
      return {
        id: "city_" + index,
        name: row.city,
        gmv: row.gmv,
        roi: row.roi,
        verifiedRate: row.verifiedRate,
        storeCount: row.store_count,
        paidOrders: row.paid_orders,
        verifiedOrders: row.verified_orders,
        adSpend: row.ad_spend,
        avgOrderValue: row.avgOrderValue
      };
    });

    return {
      dateRange: {
        from: period.from || period.monthKey,
        to: period.to || period.monthKey,
        label: period.label,
        range: period.range,
        grain: period.grain,
        monthKey: period.monthKey || null
      },
      displayPeriod: period,
      brand: brandRow,
      cities: cities,
      districts: districts,
      pois: pois
    };
  }

  function rowsForMonth(rows, monthKey) {
    if (!monthKey) return rows || [];
    return (rows || []).filter(function (row) {
      return String(row.month) === monthKey;
    });
  }

  function safeRatio(numerator, denominator) {
    var n = Number(numerator) || 0;
    var d = Number(denominator) || 0;
    return d > 0 ? n / d : 0;
  }

  function buildBrandPeerBenchmarks(drillSource, monthKey) {
    if (!monthKey) return null;
    var ownMonthly = rowsForMonth(drillSource.monthlyFacts, monthKey)[0] || {};
    var peerMonthly = rowsForMonth(drillSource.peerBrandMonthlyFacts, monthKey)[0] || {};
    var ownCities = rowsForMonth(drillSource.cityMonthlyFacts, monthKey);
    var peerCities = rowsForMonth(drillSource.peerCityMonthlyFacts, monthKey);
    var cityComparisons = ownCities.map(function (own) {
      var peer = peerCities.find(function (item) {
        return item.city === own.city;
      }) || {};
      return {
        city: own.city,
        own: {
          brandName: BRAND_NAME,
          gmv: own.gmv || 0,
          verifiedRate: safeRatio(own.verified_orders, own.paid_orders),
          avgOrderValue: own.avg_order_value || 0
        },
        peer: {
          brandName: "呷哺呷哺",
          gmv: peer.gmv || 0,
          verifiedRate: safeRatio(peer.verified_orders, peer.paid_orders),
          avgOrderValue: peer.avg_order_value || 0
        }
      };
    });
    return {
      month: monthKey,
      ownBrand: {
        id: "haidilao",
        name: BRAND_NAME,
        gtv: ownMonthly.gtv || 0,
        avgOrderValue: ownMonthly.avg_order_value || 0,
        verifiedRate: safeRatio(ownMonthly.verified_orders, ownMonthly.paid_orders),
        storeCount: (drillSource.brandProfile && drillSource.brandProfile.store_count) || 0
      },
      peerBrand: {
        id: "xiabuxiabu",
        name: "呷哺呷哺",
        gtv: peerMonthly.gtv || 0,
        avgOrderValue: peerMonthly.avg_order_value || 0,
        verifiedRate: safeRatio(peerMonthly.verified_orders, peerMonthly.paid_orders),
        storeCount: (drillSource.peerBrandProfile && drillSource.peerBrandProfile.store_count) || 0
      },
      cities: cityComparisons
    };
  }

  function buildPlatformBenchmarks(competitorBenchmarks, monthKey) {
    var platformNames = { 美团: 1, 抖音: 1, 美团到餐: 1, 抖音到店: 1 };
    return rowsForMonth(competitorBenchmarks, monthKey)
      .filter(function (row) {
        return platformNames[row.competitor];
      })
      .map(function (row) {
        var name = row.competitor === "美团到餐" ? "美团" : row.competitor === "抖音到店" ? "抖音" : row.competitor;
        return {
          name: name,
          month: row.month,
          marketShare: row.market_share || 0,
          avgOrderValue: row.avg_order_value || 0,
          verificationRate: row.verification_rate || 0,
          subsidyRate: row.subsidy_rate || 0,
          adTakeRate: row.ad_take_rate || 0,
          contentShare: row.content_share || 0
        };
      })
      .filter(function (row) {
        return row.name === "美团" || row.name === "抖音";
      });
  }

  function listMonthOptions(drillSource) {
    var months = (drillSource && drillSource.availableMonths) || [];
    return months.slice().reverse().map(function (monthKey) {
      return {
        value: monthKey,
        label: monthLabelFromKey(monthKey)
      };
    });
  }

  function initFilterFromPeriod(displayPeriod, drillSource) {
    if (!displayPeriod) {
      return {
        mode: "month",
        monthKey: pickLatestMonthKey((drillSource && drillSource.monthlyFacts) || []),
        from: "",
        to: "",
        preset: ""
      };
    }
    if (displayPeriod.mode === "month" && displayPeriod.monthKey) {
      return {
        mode: "month",
        monthKey: displayPeriod.monthKey,
        from: "",
        to: "",
        preset: ""
      };
    }
    if (displayPeriod.grain === "半年度累计") {
      return {
        mode: "range",
        monthKey: "",
        from: displayPeriod.from || "2026-01-01",
        to: displayPeriod.to || "2026-06-30",
        preset: "h1-2026"
      };
    }
    return {
      mode: "range",
      monthKey: "",
      from: displayPeriod.from || "2024-01-01",
      to: displayPeriod.to || "2026-06-30",
      preset: "full"
    };
  }

  function rebuildSceneMetrics(drillSource, filter, options) {
    options = options || {};
    var period = periodFromFilter(filter, drillSource);
    var drillMetrics = buildDrillMetrics(drillSource, period);
    var benchMonth = period.mode === "month" ? period.monthKey : null;
    var brandPeerBenchmarks = null;
    var platformBenchmarks = [];
    if (options.workflow === "competitor_benchmark") {
      var focus = options.compareFocus || "both";
      if (benchMonth) {
        if (focus !== "platform") {
          brandPeerBenchmarks = buildBrandPeerBenchmarks(drillSource, benchMonth);
        }
        if (focus !== "brand") {
          platformBenchmarks = buildPlatformBenchmarks(drillSource.competitorBenchmarks, benchMonth);
        }
      }
    }
    return {
      period: period,
      drillMetrics: drillMetrics,
      cities: drillMetrics.cities,
      districts: drillMetrics.districts,
      pois: drillMetrics.pois,
      dateRange: drillMetrics.dateRange,
      displayPeriod: period,
      brandPeerBenchmarks: brandPeerBenchmarks,
      platformBenchmarks: platformBenchmarks,
      competitors: platformBenchmarks
    };
  }

  global.BrandPilotDrillMetrics = {
    periodFromFilter: periodFromFilter,
    buildDrillMetrics: buildDrillMetrics,
    rebuildSceneMetrics: rebuildSceneMetrics,
    listMonthOptions: listMonthOptions,
    monthLabelFromKey: monthLabelFromKey,
    initFilterFromPeriod: initFilterFromPeriod,
    pickLatestMonthKey: pickLatestMonthKey
  };
})(window);
