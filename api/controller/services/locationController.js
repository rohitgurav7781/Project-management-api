const { default: axios } = require("axios");
const UtilController = require("./../services/UtilController");
const LocationData = require("../../models/LocationData");
module.exports = {
  getCountryStateCity: async (req, res, next) => {
    try {
      const { country, state, page = 0, pageSize = 10 } = req.body;
      let pipeline = [];
      if (UtilController.isEmpty(country)) {
        pipeline.push({
          $match: { name: { $regex: country, $options: "i" } },
        });
        pipeline.push({
          $project: {
            countryId: "$id",
            countryName: "$name",
          },
        });
      } else if (!UtilController.isEmpty(country) && UtilController.isEmpty(state)) {
        pipeline.push({
          $match: { name: { $regex: country, $options: "i" } },
        });
        pipeline.push({
          $unwind: "$states",
        });
        pipeline.push({
          $project: {
            stateId: "$states.id",
            stateName: "$states.name",
          },
        });
      } else {
        pipeline.push([
          {
            $match: { name: { $regex: country, $options: "i" } },
          },
          {
            $unwind: "$states",
          },
          {
            $match: { "states.name": { $regex: state, $options: "i" } },
          },
          {
            $unwind: "$states.cities",
          },

          {
            $project: {
              cityId: "$states.cities.id",
              cityName: "$states.cities.name",
            },
          },
        ]);
      }

      const result = await LocationData.aggregate(pipeline);
      UtilController.sendSuccess(req, res, next, { result });
    } catch (error) {
      UtilController.sendError(req, res, next, error);
    }
  },
  getStaticCountryName: async (req, res, next) => {
    try {
      let keyword = req.body.keyword;
      const result = await LocationData.find({
        name: { $regex: keyword, $options: "i" },
      }).select({ name: 1 });
      UtilController.sendSuccess(req, res, next, { result });
    } catch (error) {
      UtilController.sendError(req, res, next, error);
    }
  },
  getStaticStatesName: async (req, res, next) => {
    try {
      let state = req.body.state;
      let country = req.body.country;
      if (UtilController.isEmpty(country)) {
        UtilController.sendError(req, res, next, { message: "Country is required" });
        return;
      }
      const result = await LocationData.aggregate([
        {
          $match: { name: { $regex: country, $options: "i" } },
        },
        {
          $unwind: "$states",
        },
        {
          $match: { "states.name": { $regex: state, $options: "i" } },
        },
        {
          $project: {
            stateName: "$states.name",
          },
        },
      ]);
      UtilController.sendSuccess(req, res, next, { result });
    } catch (error) {
      UtilController.sendError(req, res, next, error);
    }
  },
  getStaticCityNames: async (req, res, next) => {
    try {
      let country = req.body.country;
      let state = req.body.state;
      let city = req.body.city;
      if (UtilController.isEmpty(country) && UtilController.isEmpty(state)) {
        UtilController.sendError(req, res, next, { message: "Country and state is required" });
        return;
      }
      const result = await LocationData.aggregate([
        {
          $match: { name: { $regex: country, $options: "i" } },
        },
        {
          $unwind: "$states",
        },
        {
          $match: { "states.name": { $regex: state, $options: "i" } },
        },
        {
          $unwind: "$states.cities",
        },
        {
          $match: { "states.cities.name": { $regex: city, $options: "i" } },
        },
        {
          $project: {
            cityName: "$states.cities.name",
          },
        },
      ]);
      UtilController.sendSuccess(req, res, next, { result });
    } catch (error) {
      UtilController.sendError(req, res, next, error);
    }
  },
};
