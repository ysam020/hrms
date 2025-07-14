function convertDateFormat(dateString) {
  // Split the input date string into an array
  const [year, month, day] = dateString.split("-");
  // Rearrange into dd-mm-yyyy format and return
  return `${day}-${month}-${year}`;
}

export default convertDateFormat;
