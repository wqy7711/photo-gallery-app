import { SQSHandler } from "aws-lambda";
import {
    DynamoDBClient,
    UpdateItemCommand,
    GetItemCommand,
    ReturnValue,
  } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";

const dynamoClient = new DynamoDBClient();
const TABLE_NAME = process.env.TABLE_NAME || "";

export const handler: SQSHandler = async (event) => {
  console.log("Event: ", JSON.stringify(event));
  
  if (!TABLE_NAME) {
    console.error("TABLE_NAME environment variable is not set");
    throw new Error("Configuration error: TABLE_NAME is not set");
  }
  
  for (const record of event.Records) {
    try {
      console.log("Processing record:", record.messageId);
      
      const recordBody = JSON.parse(record.body);
      console.log("Record body:", JSON.stringify(recordBody));
      
      const message = recordBody.Message ? JSON.parse(recordBody.Message) : null;
      const messageAttributes = recordBody.MessageAttributes || {};
      
      console.log("Message:", JSON.stringify(message));
      console.log("Message attributes:", JSON.stringify(messageAttributes));
      
      if (!message || !message.id || !message.value) {
        console.error("Invalid message format: Missing required fields (id or value)");
        continue;
      }
      
      const metadataType = messageAttributes.metadata_type?.Value || 
                         messageAttributes.metadata_type?.StringValue;
      
      if (!metadataType) {
        console.error("Missing metadata_type in message attributes");
        continue;
      }
      
      if (!isValidMetadataType(metadataType)) {
        console.error(`Invalid metadata type: ${metadataType}. Only Caption, Date, and Name are allowed.`);
        continue;
      }
      
      const imageId = message.id;
      const metadataValue = message.value;
      
      const getParams = {
        TableName: TABLE_NAME,
        Key: marshall({ id: imageId }),
      };
      
      console.log("Checking if image exists in database:", imageId);
      const { Item } = await dynamoClient.send(new GetItemCommand(getParams));
      
      if (!Item) {
        console.error(`Image with id ${imageId} not found in the database`);
        continue;
      }
      
      const attributeName = getAttributeNameForMetadata(metadataType);
      console.log(`Updating ${attributeName} for image ${imageId} with value: ${metadataValue}`);
      
      let updateExpression = "";
      let expressionAttributeNames = {};
      let expressionAttributeValues = {};
      
      if (attributeName === "date") {
        updateExpression = "SET #dateAttr = :value, updatedAt = :updatedAt";
        expressionAttributeNames = { "#dateAttr": "date" };
        expressionAttributeValues = marshall({
          ":value": metadataValue,
          ":updatedAt": new Date().toISOString(),
        });
      } else {
        updateExpression = `SET ${attributeName} = :value, updatedAt = :updatedAt`;
        expressionAttributeValues = marshall({
          ":value": metadataValue,
          ":updatedAt": new Date().toISOString(),
        });
      }
      
      const updateParams = {
        TableName: TABLE_NAME,
        Key: marshall({ id: imageId }),
        UpdateExpression: updateExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        ...(Object.keys(expressionAttributeNames).length > 0 && { 
          ExpressionAttributeNames: expressionAttributeNames 
        }),
        ReturnValues: ReturnValue.ALL_NEW
      };
      
      const updateResult = await dynamoClient.send(new UpdateItemCommand(updateParams));
      console.log(`Successfully updated ${metadataType} for image: ${imageId}`);
      console.log("Updated item:", JSON.stringify(unmarshall(updateResult.Attributes || {})));
      
    } catch (error) {
      console.error("Error processing metadata update:", error);
    }
  }
};

function isValidMetadataType(type: string): boolean {
  const validTypes = ["Caption", "Date", "Name"];
  return validTypes.includes(type);
}

function getAttributeNameForMetadata(metadataType: string): string {
  switch (metadataType) {
    case "Caption":
      return "caption";
    case "Date":
      return "date";
    case "Name":
      return "photographerName";
    default:
      return metadataType.toLowerCase();
  }
}