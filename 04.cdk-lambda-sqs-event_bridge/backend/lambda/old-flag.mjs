import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE_NAME = process.env.TABLE_NAME;

export const handler = async (event) => {
  console.log("Event:", JSON.stringify(event, null, 2));

  for (const record of event.Records) {
    try {
      // SQSメッセージからタスクIDを取得
      const message = JSON.parse(record.body);
      const taskId = message.taskId;

      console.log(`Processing taskId: ${taskId}`);

      // DynamoDBのタスクにoldフラグを設定
      await ddb.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id: taskId },
        UpdateExpression: "SET #old = :true, #updatedAt = :now",
        ExpressionAttributeNames: {
          "#old": "old",
          "#updatedAt": "updatedAt"
        },
        ExpressionAttributeValues: {
          ":true": true,
          ":now": new Date().toISOString()
        },
        ConditionExpression: "attribute_exists(id)"
      }));

      console.log(`Successfully set old flag for taskId: ${taskId}`);
    } catch (err) {
      console.error("Error processing record:", err);
      // エラーが発生した場合、そのメッセージは再試行される
      throw err;
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ message: "Processed successfully" })
  };
};
