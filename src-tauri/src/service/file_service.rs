use crate::entity::file_record::FileRecord;
use crate::vo::file_vo::FileVo;

pub async fn get_file_by_biz_id_service(biz_id: String) -> Result<Vec<FileVo>, anyhow::Error> {
    // 1、从本地获取文件记录
    let mut file_list = FileRecord::get_by_biz_id(&biz_id).await?;
    // 2、是否存在文件
    if file_list.is_empty() {
        // 2-1 从远程获取文件信息
        // 2-2 再重新获取文件记录
        file_list = FileRecord::get_by_biz_id(&biz_id).await?;
        // 2-3 如果还是不存在，抛出错误
        if file_list.is_empty() {
            return Err(anyhow::anyhow!("文件不存在"));
        }
    }
    // 3、转换成VO
    let result = Vec::<FileVo>::new();
    
    Ok(result)
}