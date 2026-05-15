let request = require("request");
let mongoose = require("mongoose");
const Option = require("../../models/Option");
const User = require("../../models/User");

const UtilController = require("./../services/UtilController");
const { returnCode } = require("../../../config/responseCode");
const responseCode = require("../../../config/responseCode");
const Notification = require("../../models/Notification");
module.exports = {
  getDropdownValue: async (req, res, next) => {
    try {
      const { keyword, search } = req.body;
      if (!UtilController.isEmpty(search)) {
        const result = await Option.findOne({ name: keyword });

        if (result) {
          let options = search
            ? result?.options?.filter(opt => opt?.value?.toLowerCase()?.includes(search?.toLowerCase()))
            : result?.options || [];

          UtilController.sendSuccess(req, res, next, {
            data: {
              _id: result._id,
              name: result.name,
              options: options,
            },
          });
        } else {
          UtilController.sendSuccess(req, res, next, {
            data: {
              _id: result._id,
              name: result.name,
              options: [],
            },
          });
        }
      } else {
        let result = await Option.findOne({
          name: req.body.keyword,
        });
        UtilController.sendSuccess(req, res, next, {
          data: result,
        });
      }
    } catch (err) {
      UtilController.sendError(req, res, next, err);
    }
  },
  CreateSetting: async (req, res, next) => {
    const { name, value } = req.body;
    const organizationId = req.body.organizationId || req.session.organizationId;

    if (!organizationId) {
      return UtilController.sendError(req, res, next, {
        message: "Organization ID is required",
      });
    }

    const normalizedName = name.trim().toLowerCase();
    const normalizedValue = value.trim().toLowerCase();
    const createObj = {
      createdBy: req.session.userId,
      operatedBy: req.session.userId,
      createdAt: Math.floor(Date.now() / 1000),
      updatedAt: Math.floor(Date.now() / 1000),
    };

    try {
      const duplicateOption = await Option.findOne({
        "options.value": { $regex: normalizedValue, $options: "i" },
        organizationId: new mongoose.Types.ObjectId(organizationId),
        "options.active": true,
      });

      console.log(duplicateOption);
      if (duplicateOption) {
        return UtilController.sendError(req, res, next, {
          message: "Option value already exists in another document",
          responseCode: returnCode.duplicate,
        });
      }

      let option = await Option.findOne({ name, organizationId });
      let newOptionId = null;
      console.log("organizationId", organizationId);

      if (option) {
        const existingOption = option?.options?.find(
          opt => option.active === true && opt.value.toLowerCase() === normalizedValue,
        );

        if (existingOption) {
          return UtilController.sendError(req, res, next, {
            message: "Option value already exists in this document",
            responseCode: returnCode.duplicate,
          });
        }

        const newOption = { value, ...createObj };
        option.options.push(newOption);
        await option.save();

        newOptionId = option.options[option.options.length - 1]._id;
      } else {
        const newOption = { value, ...createObj };
        option = new Option({
          name,
          organizationId,
          options: [newOption],
        });

        await option.save();
        newOptionId = option.options[0]._id;
      }

      const savedOption = await Option.findById(option._id).lean();
      savedOption.options = savedOption.options.map(opt => ({
        value: opt.value,
        active: opt.active,
        createdBy: opt.createdBy,
        optionId: opt._id,
      }));

      // Send Notification
      await Notification.create({
        userType: "organizationAdmin",
        recordId: savedOption?._id,
        userId: req.session.userId,
        organizationId: organizationId,
        title: `New ${savedOption?.name} Option Created`,
        body: `A new option "${value}" has been added successfully. Click to view details.`,
        type: "system",
        read: false,
        visibleOnHome: true,
        actionUrl: `/settings?id=${newOptionId}`, // Send specific option's _id
      });

      return UtilController.sendSuccess(req, res, next, {
        data: savedOption,
        message: "Option created successfully",
      });
    } catch (err) {
      return UtilController.sendError(req, res, next, err);
    }
  },
  getOptionList: async (req, res, next) => {
    try {
      const {
        names,
        name,
        keyword,
        page = 0,
        pageSize = 10,
        sortField,
        sortOrder,
        active,
        endDate,
        startDate,
      } = req.body;

      // Extract organizationId from the session
      const { organizationId } = req.session || req.body;
      if (!organizationId) {
        return UtilController.sendError(req, res, next, {
          message: "Organization ID not found in session.",
        });
      }

      const matchStage = { organizationId: mongoose.Types.ObjectId(organizationId) };
      if (Array.isArray(names) && names.length > 0) {
        matchStage.name = { $in: names };
      }

      // Explicitly filter by `name` if provided
      if (name) {
        matchStage["name"] = name;
      }

      if (keyword) {
        const regex = new RegExp(keyword, "i");
        matchStage.$or = [{ name: regex }, { "options.value": { $regex: keyword, $options: "i" } }];
      }
      if (typeof active !== "undefined") {
        matchStage["options.active"] = active;
      }

      const parsedPage = parseInt(page, 10);
      const parsedLimit = parseInt(pageSize, 10);

      if (isNaN(parsedPage) || isNaN(parsedLimit) || parsedPage < 0 || parsedLimit < 1) {
        return UtilController.sendError(req, res, next, "Invalid page or limit");
      }

      const skip = parsedPage * parsedLimit;

      const optionsData = await Option.aggregate([
        { $match: matchStage },
        { $unwind: "$options" },
        {
          $match: {
            ...(keyword && { "options.value": { $regex: keyword, $options: "i" } }),
            ...(typeof active === "boolean" && { "options.active": active }),
            ...(startDate &&
              endDate && {
                $and: [{ "options.createdAt": { $gte: startDate } }, { "options.createdAt": { $lte: endDate } }],
              }),
          },
        },
        {
          $sort: {
            "options.createdAt": -1,
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "options.createdBy",
            foreignField: "_id",
            as: "createdByInfo",
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "options.operatedBy",
            foreignField: "_id",
            as: "operatedByInfo",
          },
        },
        {
          $lookup: {
            from: "organizations",
            localField: "organizationId",
            foreignField: "_id",
            as: "organization",
          },
        },
        { $unwind: { path: "$organization", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: "$options._id",
            name: 1,
            value: "$options.value",
            active: "$options.active",
            createdBy: {
              $concat: [
                { $ifNull: [{ $arrayElemAt: ["$createdByInfo.fname", 0] }, ""] },
                " ",
                { $ifNull: [{ $arrayElemAt: ["$createdByInfo.lname", 0] }, ""] },
              ],
            },
            organizationName: "$organization.organizationName",
            operatedBy: {
              $concat: [
                { $ifNull: [{ $arrayElemAt: ["$operatedByInfo.fname", 0] }, ""] },
                " ",
                { $ifNull: [{ $arrayElemAt: ["$operatedByInfo.lname", 0] }, ""] },
              ],
            },
            createdAt: "$options.createdAt",
            updatedAt: "$options.updatedAt",
          },
        },
        { $skip: skip },
        { $limit: parsedLimit },
      ]);

      return UtilController.sendSuccess(req, res, next, {
        rows: optionsData,
        responseCode: returnCode.validSession,
        pages: parsedPage,
        filterRecords: optionsData.length,
      });
    } catch (err) {
      UtilController.sendError(req, res, next, err);
    }
  },

  deleteOptions: async (req, res, next) => {
    const { recordIds } = req.body; // `recordIds` can be a single ID or an array of option _ids to delete

    try {
      // If recordIds is a single ID, convert it into an array
      const idsToDelete = Array.isArray(recordIds) ? recordIds : [recordIds];

      // Delete options from any document where `options._id` matches any of the `_ids` in `idsToDelete` array
      const result = await Option.updateMany(
        { "options._id": { $in: idsToDelete } },
        { $set: { "options.$[elem].active": false } },
        {
          arrayFilters: [{ "elem._id": { $in: idsToDelete } }],
          multi: true,
        },
      );

      if (result.modifiedCount === 0) {
        return UtilController.sendError(req, res, next, {
          message: "No matching options found to delete",
        });
      }

      return UtilController.sendSuccess(req, res, next, {
        message: "Options deleted successfully",
      });
    } catch (err) {
      UtilController.sendError(req, res, next, err);
    }
  },

 getDropdownOptions: async (req, res, next) => {
    try {
      let { name, names, keyword, domains } = req.body; // Add 'domains' and 'names' parameters

      let organizationId = req.body?.organizationId || req.session?.organizationId;
      organizationId = mongoose.Types.ObjectId(organizationId);

      
      let matchConditions = { organizationId };


      if (domains && Array.isArray(domains) && domains.length > 0) {
      
        const domainObjectIds = domains.map(id =>
          mongoose.Types.ObjectId.isValid(id) ? mongoose.Types.ObjectId(id) : id,
        );

        
        const domainRecords = await Option.find({
          organizationId,
          name: "Domain",
          "options._id": { $in: domainObjectIds },
          "options.active": true,
        });

        const domainNames = [];
        domainRecords.forEach(record => {
          record.options.forEach(option => {
            if (domainObjectIds.some(id => id.toString() === option._id.toString())) {
              domainNames.push(option.value);
            }
          });
        });

        if (domainNames.length > 0) {
          matchConditions.name = name; 
          
        } else {
          return UtilController.sendSuccess(req, res, next, {
            result: [],
            message: "No valid domains found",
          });
        }
      }
     
      else if (name) {
        matchConditions.name = name;
      }
      
      else if (names && Array.isArray(names) && names.length > 0) {
        matchConditions.name = { $in: names };
      }

      const pipeline = [
        { $match: matchConditions },
        { $project: { options: 1, name: 1 } },
        { $unwind: "$options" },
        { $match: { "options.active": true } },
      ];

    
      if (domains && Array.isArray(domains) && domains.length > 0) {
        const domainRecords = await Option.find({
          organizationId,
          name: "Domain",
          "options._id": { $in: domains.map(id => mongoose.Types.ObjectId(id)) },
          "options.active": true,
        });

        const domainNames = [];
        domainRecords.forEach(record => {
          record.options.forEach(option => {
            if (domains.some(id => id.toString() === option._id.toString())) {
              domainNames.push(option.value);
            }
          });
        });

        if (domainNames.length > 0) {
        
          pipeline.push({
            $match: {
              $or: [
                { "options.domain": { $in: domainNames } },
                { "options.domainId": { $in: domains.map(id => mongoose.Types.ObjectId(id)) } }, 
            
              ],
            },
          });
        }
      }

    
      if (keyword) {
        pipeline.push({
          $match: {
            $or: [
              { "options.display": { $regex: keyword, $options: "i" } },
              { "options.value": { $regex: keyword, $options: "i" } },
              { "options.name": { $regex: keyword, $options: "i" } },
            ],
          },
        });
      }

      
      pipeline.push({
        $project: {
          _id: "$options._id",
          value: "$options.value",
          display: "$options.display",
          logo: "$options.logo",
          active: "$options.active",
          name: "$options.name",
          domain: "$options.domain",
          domainId: "$options.domainId", 
        },
      });

      const result = await Option.aggregate(pipeline);

      if (!result || result.length === 0) {
        return UtilController.sendSuccess(req, res, next, {
          result: [],
          message: "No active options found for the specified criteria",
        });
      }

      return UtilController.sendSuccess(req, res, next, {
        result: result,
      });
    } catch (err) {
      console.error("Error in getDropdownOptions:", err);
      UtilController.sendError(req, res, next, err);
    }
  },

  //fetch record by record id
  getOptionById: async (req, res, next) => {
    try {
      const { recordId } = req.body;

      const result = await Option.findOne(
        { "options._id": new mongoose.Types.ObjectId(recordId) },
        {
          name: 1,
          options: { $elemMatch: { _id: new mongoose.Types.ObjectId(recordId) } },
        },
      );

      if (!result || !result.options || result.options.length === 0) {
        return UtilController.sendError(req, res, next, {
          message: "Option not found",
        });
      }
      return UtilController.sendSuccess(req, res, next, {
        name: result.name,
        option: result.options[0],
      });
    } catch (err) {
      console.error("Error fetching option by ID:", err);
      UtilController.sendError(req, res, next, err);
    }
  },
  updateSetting: async (req, res, next) => {
    let { recordId, value } = req.body;
    let organizationId = req.body.organizationId || req.session.organizationId; // Use the organization ID from the session or body

    try {
      let option = await Option.findOne({
        "options._id": mongoose.Types.ObjectId(recordId),
        organizationId,
      });

      if (UtilController.isEmpty(option)) {
        return UtilController.sendError(req, res, next, { message: "Option not found" });
      }

      const updatedOption = await Option.findOneAndUpdate(
        {
          "options._id": mongoose.Types.ObjectId(recordId),
          organizationId,
        },
        {
          $set: {
            "options.$.value": value,
            "options.$.updatedAt": Math.floor(Date.now() / 1000),
            "options.$.operatedBy": req.session.userId,
            updatedAt: Math.floor(Date.now() / 1000),
          },
        },
        { new: true },
      );

      if (UtilController.isEmpty(updatedOption)) {
        return UtilController.sendError(req, res, next, { message: "Failed to update the option" });
      }

      return UtilController.sendSuccess(req, res, next, {
        data: updatedOption,
        message: "Option updated successfully",
        responseCode: returnCode.validSession,
      });
    } catch (err) {
      UtilController.sendError(req, res, next, err);
    }
  },
};
